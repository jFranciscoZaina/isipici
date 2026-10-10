-- Milestone 5.3. Aplicar manualmente después de 13/14/15, una sola vez.
BEGIN;
ALTER TABLE public.payments ADD COLUMN allocation_selection jsonb, ADD COLUMN allocation_intent jsonb,
 ADD CONSTRAINT payment_allocation_context UNIQUE(id,owner_id,client_id,recurring_agreement_id,currency);
CREATE TABLE public.payment_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL,client_id uuid NOT NULL,payment_id uuid NOT NULL,
 recurring_installment_id uuid NOT NULL,recurring_agreement_id uuid NOT NULL,currency text NOT NULL,
 amount_applied numeric(14,2) NOT NULL CHECK(amount_applied>=0),discount_applied numeric(14,2) NOT NULL CHECK(discount_applied>=0),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(amount_applied+discount_applied>0),UNIQUE(payment_id,recurring_installment_id),
 FOREIGN KEY(payment_id,owner_id,client_id,recurring_agreement_id,currency) REFERENCES public.payments(id,owner_id,client_id,recurring_agreement_id,currency) ON DELETE RESTRICT,
 FOREIGN KEY(recurring_installment_id,owner_id,client_id,recurring_agreement_id,currency) REFERENCES public.recurring_installments(id,owner_id,client_id,recurring_agreement_id,currency) ON DELETE RESTRICT
);
CREATE INDEX installment_owner_period_idx ON public.recurring_installments(owner_id,client_id,period_from,period_to);
CREATE INDEX allocation_installment_idx ON public.payment_allocations(recurring_installment_id);
CREATE INDEX allocation_owner_client_idx ON public.payment_allocations(owner_id,client_id,payment_id);
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_allocations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.payment_allocations TO service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.payments p JOIN public.recurring_installments i ON i.id=p.recurring_installment_id WHERE p.owner_id IS DISTINCT FROM i.owner_id OR p.client_id IS DISTINCT FROM i.client_id OR p.currency IS DISTINCT FROM i.currency OR p.recurring_agreement_id IS DISTINCT FROM i.recurring_agreement_id OR p.amount IS NULL OR p.discount IS NULL OR p.amount<0 OR p.discount<0 OR p.amount+p.discount<=0)
 OR EXISTS(SELECT 1 FROM public.recurring_installments i JOIN public.payments p ON p.recurring_installment_id=i.id GROUP BY i.id,i.amount_due HAVING sum(p.amount+p.discount)>i.amount_due)
 THEN RAISE EXCEPTION 'REVIEW_REQUIRED: inconsistent legacy installment payments'; END IF;
END $$;
INSERT INTO public.payment_allocations(owner_id,client_id,payment_id,recurring_installment_id,recurring_agreement_id,currency,amount_applied,discount_applied)
 SELECT owner_id,client_id,id,recurring_installment_id,recurring_agreement_id,currency,amount,discount FROM public.payments WHERE recurring_installment_id IS NOT NULL;
CREATE FUNCTION public.installment_coverage(p_id uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT sum(amount_applied+discount_applied) FROM public.payment_allocations WHERE recurring_installment_id=p_id),0)
 +coalesce((SELECT sum(p.amount+p.discount) FROM public.payments p WHERE p.recurring_installment_id=p_id AND NOT EXISTS(SELECT 1 FROM public.payment_allocations a WHERE a.payment_id=p.id)),0);
$$;
CREATE FUNCTION public.guard_payment_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p public.payments%ROWTYPE;i public.recurring_installments%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'ALLOCATION_IMMUTABLE'; END IF;
 SELECT * INTO p FROM public.payments WHERE id=NEW.payment_id FOR UPDATE;
 SELECT * INTO i FROM public.recurring_installments WHERE id=NEW.recurring_installment_id FOR UPDATE;
 IF p.payment_type IS DISTINCT FROM 'recurring' OR i.status<>'open' THEN RAISE EXCEPTION 'PAYMENT_INSTALLMENT_DENIED'; END IF;
 IF coalesce((SELECT sum(amount_applied) FROM public.payment_allocations WHERE payment_id=p.id),0)+NEW.amount_applied>p.amount OR coalesce((SELECT sum(discount_applied) FROM public.payment_allocations WHERE payment_id=p.id),0)+NEW.discount_applied>p.discount THEN RAISE EXCEPTION 'PAYMENT_OVERALLOCATION'; END IF;
 IF coalesce((SELECT sum(amount_applied+discount_applied) FROM public.payment_allocations WHERE recurring_installment_id=i.id),0)
 +coalesce((SELECT sum(q.amount+q.discount) FROM public.payments q WHERE q.recurring_installment_id=i.id AND q.id<>p.id AND NOT EXISTS(SELECT 1 FROM public.payment_allocations x WHERE x.payment_id=q.id)),0)+NEW.amount_applied+NEW.discount_applied>i.amount_due THEN RAISE EXCEPTION 'INSTALLMENT_OVERALLOCATION'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER allocation_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payment_allocations FOR EACH ROW EXECUTE FUNCTION public.guard_payment_allocation();
CREATE FUNCTION public.check_payment_allocation_total() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p public.payments%ROWTYPE;cash numeric;bonus numeric;
BEGIN
 SELECT * INTO p FROM public.payments WHERE id=NEW.payment_id;
 SELECT sum(amount_applied),sum(discount_applied) INTO cash,bonus FROM public.payment_allocations WHERE payment_id=p.id;
 IF cash IS DISTINCT FROM p.amount OR bonus IS DISTINCT FROM p.discount THEN RAISE EXCEPTION 'PAYMENT_ALLOCATION_INCOMPLETE'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER allocation_total AFTER INSERT ON public.payment_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_payment_allocation_total();
CREATE FUNCTION public.legacy_payment_allocation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.recurring_installment_id IS NOT NULL THEN INSERT INTO public.payment_allocations(owner_id,client_id,payment_id,recurring_installment_id,recurring_agreement_id,currency,amount_applied,discount_applied)
 VALUES(NEW.owner_id,NEW.client_id,NEW.id,NEW.recurring_installment_id,NEW.recurring_agreement_id,NEW.currency,NEW.amount,NEW.discount); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER legacy_allocation AFTER INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.legacy_payment_allocation();
ALTER TABLE public.recurring_installments DROP CONSTRAINT recurring_installments_recurring_agreement_id_due_date_key;
CREATE UNIQUE INDEX installment_current_cycle ON public.recurring_installments(recurring_agreement_id,due_date) WHERE status<>'cancelled';
ALTER TABLE public.recurring_agreements ADD COLUMN plan_name text CHECK(length(plan_name)<=200);
CREATE OR REPLACE FUNCTION public.refresh_installment_snapshot(p_owner uuid,p_client uuid) RETURNS numeric LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.clients%ROWTYPE; total numeric; next_due date;
BEGIN
 c:=public.lifecycle_client_lock(p_owner,p_client);
 SELECT coalesce(sum(greatest(i.amount_due-public.installment_coverage(i.id),0)),0) INTO total
 FROM public.recurring_installments i WHERE i.owner_id=p_owner AND i.client_id=p_client AND i.status='open' AND i.due_date<=(now() AT TIME ZONE 'UTC')::date;
 SELECT least((SELECT min(i.due_date) FROM public.recurring_installments i JOIN public.recurring_agreements a ON a.id=i.recurring_agreement_id
  WHERE i.owner_id=p_owner AND i.client_id=p_client AND i.status='open' AND a.status='active'),
  (SELECT (a.next_charge_at AT TIME ZONE 'UTC')::date FROM public.recurring_agreements a WHERE a.owner_id=p_owner AND a.client_id=p_client AND a.status='active' AND a.installments_enabled)) INTO next_due;
 total:=coalesce(c.legacy_debt_amount,c.current_debt,0)+total;
 UPDATE public.clients SET legacy_debt_amount=coalesce(c.legacy_debt_amount,c.current_debt,0),current_debt=total,
 next_payment_date=CASE WHEN EXISTS(SELECT 1 FROM public.recurring_agreements a WHERE a.owner_id=p_owner AND a.client_id=p_client AND a.installments_enabled) THEN next_due ELSE c.next_payment_date END WHERE id=p_client;
 RETURN total;
END $$;
CREATE OR REPLACE FUNCTION public.guard_installment_obligation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.recurring_agreements%ROWTYPE; covered numeric; today date:=(now() AT TIME ZONE 'UTC')::date;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'INSTALLMENT_HISTORY_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.client_id<>OLD.client_id OR NEW.recurring_agreement_id<>OLD.recurring_agreement_id OR NEW.currency<>OLD.currency OR NEW.amount_due<>OLD.amount_due OR NEW.due_date<>OLD.due_date OR NEW.period_from<>OLD.period_from OR NEW.period_to<>OLD.period_to THEN RAISE EXCEPTION 'INSTALLMENT_HISTORY_IMMUTABLE'; END IF;
  IF OLD.status<>'open' AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'INSTALLMENT_TERMINAL'; END IF;
  covered:=public.installment_coverage(OLD.id);
  IF NEW.status='paid' AND covered<>NEW.amount_due THEN RAISE EXCEPTION 'INSTALLMENT_NOT_SETTLED'; END IF;
  IF OLD.status='open' AND NEW.status='cancelled' AND (OLD.due_date<=today OR covered>0) THEN RAISE EXCEPTION 'INSTALLMENT_DEBT_PRESERVED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_installment_payment() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE i public.recurring_installments%ROWTYPE; covered numeric;
BEGIN
 IF TG_OP<>'INSERT' THEN
  IF OLD.recurring_installment_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.payment_allocations WHERE payment_id=OLD.id) THEN RAISE EXCEPTION 'INSTALLMENT_PAYMENT_IMMUTABLE'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.recurring_installment_id IS NOT NULL THEN RAISE EXCEPTION 'INSTALLMENT_PAYMENT_IMMUTABLE'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.recurring_installment_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO i FROM public.recurring_installments WHERE id=NEW.recurring_installment_id FOR UPDATE;
 IF NOT FOUND OR i.owner_id<>NEW.owner_id OR i.client_id<>NEW.client_id OR i.recurring_agreement_id IS DISTINCT FROM NEW.recurring_agreement_id OR i.currency<>NEW.currency THEN RAISE EXCEPTION 'PAYMENT_INSTALLMENT_DENIED'; END IF;
 IF i.status<>'open' OR NEW.amount<0 OR NEW.discount<0 OR NEW.amount+NEW.discount<=0 THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 covered:=public.installment_coverage(i.id);
 IF covered+NEW.amount+NEW.discount>i.amount_due THEN RAISE EXCEPTION 'INSTALLMENT_OVERALLOCATION'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_subscription_lifecycle() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.clients%ROWTYPE;
BEGIN
 SELECT * INTO c FROM public.clients WHERE id=NEW.client_id FOR SHARE;
 IF c.archived_at IS NOT NULL AND NEW.status IN ('pending','active') THEN RAISE EXCEPTION 'CLIENT_ARCHIVED'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status IN ('cancelled','failed') AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'SUBSCRIPTION_TERMINAL'; END IF;
  IF NEW.currency IS DISTINCT FROM OLD.currency OR NEW.provider IS DISTINCT FROM OLD.provider OR NEW.owner_id<>OLD.owner_id OR NEW.client_id<>OLD.client_id THEN RAISE EXCEPTION 'SUBSCRIPTION_CONFIG_IMMUTABLE'; END IF;
 IF (NEW.amount IS DISTINCT FROM OLD.amount OR NEW.interval_unit IS DISTINCT FROM OLD.interval_unit OR NEW.interval_count IS DISTINCT FROM OLD.interval_count OR NEW.billing_anchor_date IS DISTINCT FROM OLD.billing_anchor_date OR NEW.plan_name IS DISTINCT FROM OLD.plan_name) AND current_setting('isipici.edit_plan',true) IS DISTINCT FROM OLD.id::text THEN RAISE EXCEPTION 'SUBSCRIPTION_CONFIG_IMMUTABLE'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.ensure_recurring_installments_through(p_owner uuid,p_client uuid,p_through date) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.clients%ROWTYPE; a public.recurring_agreements%ROWTYPE; cursor_date date; next_due date; freq text; generated integer:=0;
BEGIN
 c:=public.lifecycle_client_lock(p_owner,p_client);
 IF p_through IS NULL OR p_through>(now() AT TIME ZONE 'UTC')::date+180 THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 IF c.archived_at IS NOT NULL THEN RETURN 0; END IF;
 SELECT * INTO a FROM public.recurring_agreements WHERE owner_id=p_owner AND client_id=p_client AND status='active' FOR UPDATE;
 IF NOT FOUND OR NOT a.installments_enabled THEN RETURN 0; END IF;
 freq:=public.agreement_frequency(a.interval_unit,a.interval_count);
 cursor_date:=(a.next_charge_at AT TIME ZONE 'UTC')::date;
 IF cursor_date IS NULL OR a.billing_anchor_date IS NULL THEN RAISE EXCEPTION 'REVIEW_REQUIRED: missing schedule'; END IF;
 WHILE cursor_date<=p_through LOOP
  IF generated>=400 THEN RAISE EXCEPTION 'REVIEW_REQUIRED: generation limit; catch up using shorter horizons'; END IF;
  next_due:=public.payment_next_recurring_date(freq,a.billing_anchor_date,cursor_date);
  INSERT INTO public.recurring_installments(owner_id,client_id,recurring_agreement_id,due_date,period_from,period_to,amount_due,currency)
   VALUES(p_owner,p_client,a.id,cursor_date,cursor_date,next_due-1,a.amount,a.currency) ON CONFLICT(recurring_agreement_id,due_date) WHERE status<>'cancelled' DO NOTHING;
  cursor_date:=next_due;generated:=generated+1;
 END LOOP;
 UPDATE public.recurring_agreements SET next_charge_at=cursor_date::timestamp AT TIME ZONE 'UTC' WHERE id=a.id;
 PERFORM public.refresh_installment_snapshot(p_owner,p_client);
 RETURN generated;
END $$;
CREATE OR REPLACE FUNCTION public.subscription_lifecycle(p_owner uuid,p_client uuid,p_action text,p_input jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.clients%ROWTYPE; a public.recurring_agreements%ROWTYPE; old_id uuid; freq text; anchor date; first_due date; next_due date; price numeric; unit text; cnt integer; currency text; today date:=(now() AT TIME ZONE 'UTC')::date;
BEGIN
 c:=public.lifecycle_client_lock(p_owner,p_client);
 SELECT * INTO a FROM public.recurring_agreements WHERE owner_id=p_owner AND client_id=p_client AND status IN ('pending','active','paused') FOR UPDATE;
 IF p_action='reactivate' THEN UPDATE public.clients SET archived_at=NULL WHERE id=p_client; RETURN jsonb_build_object('ok',true); END IF;
 IF p_action='archive' THEN
  UPDATE public.clients SET archived_at=coalesce(archived_at,now()),next_payment_date=NULL WHERE id=p_client;
  IF a.id IS NOT NULL THEN
   UPDATE public.recurring_agreements SET status='paused' WHERE id=a.id;
   UPDATE public.recurring_installments i SET status='cancelled',cancelled_at=now() WHERE recurring_agreement_id=a.id AND status='open' AND due_date>today
    AND public.installment_coverage(i.id)=0;
  END IF;
  PERFORM public.refresh_installment_snapshot(p_owner,p_client); RETURN jsonb_build_object('ok',true);
 END IF;
 IF c.archived_at IS NOT NULL THEN RAISE EXCEPTION 'CLIENT_ARCHIVED'; END IF;
 IF p_action='change' THEN RETURN public.edit_recurring_plan(p_owner,p_client,p_input); END IF;
 IF p_action IN ('pause','resume','cancel','change','adopt') THEN
  IF a.id IS NULL OR a.id IS DISTINCT FROM (p_input->>'agreementId')::uuid THEN RAISE EXCEPTION 'PAYMENT_AGREEMENT_DENIED'; END IF;
  IF a.provider<>'manual' THEN RAISE EXCEPTION 'PROVIDER_LIFECYCLE_UNAVAILABLE'; END IF;
 END IF;
 IF p_action IN ('pause','cancel','change') THEN
  UPDATE public.recurring_agreements SET status=CASE WHEN p_action='pause' THEN 'paused' ELSE 'cancelled' END,
   cancelled_at=CASE WHEN p_action='pause' THEN cancelled_at ELSE now() END WHERE id=a.id;
  UPDATE public.recurring_installments i SET status='cancelled',cancelled_at=now() WHERE recurring_agreement_id=a.id AND status='open' AND due_date>today
   AND public.installment_coverage(i.id)=0;
  IF p_action<>'change' THEN UPDATE public.clients SET next_payment_date=NULL WHERE id=p_client;PERFORM public.refresh_installment_snapshot(p_owner,p_client);RETURN jsonb_build_object('ok',true); END IF;
  old_id:=a.id;
 END IF;
 IF p_action IN ('resume','adopt') THEN
  IF (p_action='resume' AND a.status<>'paused') OR (p_action='adopt' AND (a.status<>'active' OR a.installments_enabled)) THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_CONFLICT'; END IF;
  first_due:=(p_input->>'nextDueDate')::date;
  freq:=public.agreement_frequency(a.interval_unit,a.interval_count);
  IF first_due IS NULL OR first_due<today OR a.billing_anchor_date IS NULL OR first_due<a.billing_anchor_date OR
   (first_due<>a.billing_anchor_date AND public.payment_next_recurring_date(freq,a.billing_anchor_date,first_due-1)<>first_due) THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_CONFLICT'; END IF;
  -- Fechas canceladas por pausa no vuelven a generar obligaciones retroactivas.
  IF EXISTS(SELECT 1 FROM public.recurring_installments WHERE recurring_agreement_id=a.id AND due_date=first_due AND status IN ('cancelled','waived','paid')) THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_CONFLICT'; END IF;
  next_due:=public.payment_next_recurring_date(freq,a.billing_anchor_date,first_due);
  UPDATE public.recurring_agreements SET status='active',installments_enabled=true,next_charge_at=next_due::timestamp AT TIME ZONE 'UTC' WHERE id=a.id;
  INSERT INTO public.recurring_installments(owner_id,client_id,recurring_agreement_id,due_date,period_from,period_to,amount_due,currency)
   VALUES(p_owner,p_client,a.id,first_due,first_due,next_due-1,a.amount,a.currency) ON CONFLICT(recurring_agreement_id,due_date) WHERE status<>'cancelled' DO NOTHING;
  PERFORM public.refresh_installment_snapshot(p_owner,p_client);
  RETURN jsonb_build_object('ok',true,'agreementId',a.id);
 END IF;
 IF p_action IN ('create','change') THEN
  IF p_action='create' AND a.id IS NOT NULL THEN RAISE EXCEPTION 'CURRENT_AGREEMENT_EXISTS'; END IF;
  freq:=p_input->>'frequency';anchor:=(p_input->>'anchorDate')::date;price:=(p_input->>'amount')::numeric;
  IF freq IS NULL OR freq NOT IN ('weekly','biweekly','monthly') OR anchor IS NULL OR anchor<DATE '1900-01-01' OR price IS NULL OR price<=0 OR price>1e12 OR price<>round(price,2) THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
  SELECT default_currency INTO currency FROM public.owners WHERE id=p_owner;
  unit:=CASE WHEN freq='monthly' THEN 'month' ELSE 'week' END;cnt:=CASE WHEN freq='biweekly' THEN 2 ELSE 1 END;
  next_due:=public.payment_next_recurring_date(freq,anchor,anchor);
  INSERT INTO public.recurring_agreements(owner_id,client_id,provider,status,amount,currency,interval_unit,interval_count,billing_anchor_date,next_charge_at,started_at,installments_enabled)
   VALUES(p_owner,p_client,'manual','active',price,currency,unit,cnt,anchor,next_due::timestamp AT TIME ZONE 'UTC',now(),true) RETURNING * INTO a;
  INSERT INTO public.recurring_installments(owner_id,client_id,recurring_agreement_id,due_date,period_from,period_to,amount_due,currency)
   VALUES(p_owner,p_client,a.id,anchor,anchor,next_due-1,price,currency);
  PERFORM public.refresh_installment_snapshot(p_owner,p_client);
  RETURN jsonb_build_object('ok',true,'agreementId',a.id,'previousAgreementId',old_id);
 END IF;
 RAISE EXCEPTION 'PAYMENT_INPUT_INVALID';
END $$;
CREATE FUNCTION public.edit_recurring_plan(p_owner uuid,p_client uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.clients%ROWTYPE;a public.recurring_agreements%ROWTYPE;effective date:=(p_input->>'anchorDate')::date;protected_end date;price numeric:=(p_input->>'amount')::numeric;freq text:=p_input->>'frequency';today date:=(now() AT TIME ZONE 'UTC')::date;setting_before text;
BEGIN
 c:=public.lifecycle_client_lock(p_owner,p_client);
 SELECT * INTO a FROM public.recurring_agreements WHERE id=(p_input->>'agreementId')::uuid AND owner_id=p_owner AND client_id=p_client AND status IN ('active','paused') FOR UPDATE;
 IF NOT FOUND OR a.provider<>'manual' OR c.archived_at IS NOT NULL THEN RAISE EXCEPTION 'PAYMENT_AGREEMENT_DENIED'; END IF;
 IF effective IS NULL OR effective<=today OR effective>today+180 OR price IS NULL OR price<=0 OR price>1e12 OR price<>round(price,2) OR freq IS NULL OR freq NOT IN ('weekly','biweekly','monthly') OR length(p_input->>'planName')>200 THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 SELECT max(period_to) INTO protected_end FROM public.recurring_installments i WHERE recurring_agreement_id=a.id AND (due_date<=today OR status IN ('paid','waived') OR public.installment_coverage(i.id)>0);
 IF effective<=protected_end THEN RAISE EXCEPTION 'PLAN_EFFECTIVE_DATE_PROTECTED'; END IF;
 IF EXISTS(SELECT 1 FROM public.recurring_installments WHERE recurring_agreement_id=a.id AND status='open' AND due_date<effective AND period_to>=effective) THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_CONFLICT'; END IF;
 UPDATE public.recurring_installments i SET status='cancelled',cancelled_at=now() WHERE recurring_agreement_id=a.id AND status='open' AND due_date>=effective AND due_date>today AND public.installment_coverage(i.id)=0;
 setting_before:=current_setting('isipici.edit_plan',true);PERFORM set_config('isipici.edit_plan',a.id::text,true);
 UPDATE public.recurring_agreements SET amount=price,interval_unit=CASE WHEN freq='monthly' THEN 'month' ELSE 'week' END,interval_count=CASE WHEN freq='biweekly' THEN 2 ELSE 1 END,billing_anchor_date=effective,next_charge_at=effective::timestamp AT TIME ZONE 'UTC',installments_enabled=true,plan_name=coalesce(nullif(trim(p_input->>'planName'),''),plan_name) WHERE id=a.id;
 PERFORM set_config('isipici.edit_plan',coalesce(setting_before,''),true);
 IF a.status='active' THEN PERFORM public.ensure_recurring_installments_through(p_owner,p_client,effective); END IF;
 PERFORM public.refresh_installment_snapshot(p_owner,p_client);
 RETURN jsonb_build_object('ok',true,'agreementId',a.id);
END $$;
CREATE OR REPLACE FUNCTION public.register_canonical_payment(p_owner_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE c public.clients%ROWTYPE; a public.recurring_agreements%ROWTYPE; i public.recurring_installments%ROWTYPE; saved public.payments%ROWTYPE;
 result jsonb; owner_currency text; client_id uuid:=(p_input->>'clientId')::uuid; installment_id uuid:=(p_input->>'recurringInstallmentId')::uuid;
 agreement_id uuid:=(p_input->>'recurringAgreementId')::uuid; provider text:=p_input->>'provider';external_id text:=nullif(p_input->>'providerPaymentId','');
 account_id uuid:=(p_input->>'providerAccountId')::uuid; amount numeric:=(p_input->>'amount')::numeric;discount numeric:=coalesce((p_input->>'discount')::numeric,0);
 covered numeric;remaining numeric;freq text;cycle date;next_due date;today date:=(now() AT TIME ZONE 'UTC')::date;
BEGIN
 c:=public.lifecycle_client_lock(p_owner_id,client_id);
 SELECT default_currency INTO owner_currency FROM public.owners WHERE id=p_owner_id;
 IF (p_input->>'currency') IS DISTINCT FROM owner_currency THEN RAISE EXCEPTION 'PAYMENT_CURRENCY_CONFLICT'; END IF;
 IF provider IS NULL OR provider NOT IN ('manual','stripe','mercadopago') OR amount IS NULL OR amount<0 OR amount>1e12 OR amount<>round(amount,2) OR discount<0 OR discount>1e12 OR discount<>round(discount,2) THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 IF provider<>'manual' THEN
  IF external_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.payment_provider_accounts WHERE id=account_id AND owner_id=p_owner_id AND payment_provider_accounts.provider=provider AND default_currency=owner_currency AND status='connected') THEN RAISE EXCEPTION 'PAYMENT_ACCOUNT_DENIED'; END IF;
 ELSE IF external_id IS NOT NULL OR account_id IS NOT NULL THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF; END IF;
 IF external_id IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(provider||':'||external_id,0));
  SELECT * INTO saved FROM public.payments WHERE payments.provider=provider AND provider_payment_id=external_id;
  IF FOUND AND saved.recurring_installment_id IS NOT NULL THEN
   IF saved.owner_id<>p_owner_id OR saved.client_id<>client_id OR saved.currency<>owner_currency OR saved.amount<>amount OR saved.discount<>discount OR p_input->>'paymentType'<>'recurring'
    OR saved.payment_provider_account_id IS DISTINCT FROM account_id OR (installment_id IS NOT NULL AND saved.recurring_installment_id<>installment_id)
    OR (p_input->>'plan' IS NOT NULL AND saved.plan IS DISTINCT FROM (p_input->>'plan'))
    OR (agreement_id IS NOT NULL AND saved.recurring_agreement_id<>agreement_id) OR saved.receipt_note IS DISTINCT FROM (p_input->>'receiptNote') OR saved.concept IS DISTINCT FROM (p_input->>'concept')
    OR (p_input->>'cycleDate' IS NOT NULL AND saved.period_from<>(p_input->>'cycleDate')::date)
    OR (p_input->>'periodFrom' IS NOT NULL AND saved.period_from<>(p_input->>'periodFrom')::date)
    OR (p_input->>'periodTo' IS NOT NULL AND saved.period_to<>(p_input->>'periodTo')::date) THEN RAISE EXCEPTION 'PAYMENT_ID_CONFLICT'; END IF;
   RETURN jsonb_build_object('payment',to_jsonb(saved),'duplicate',true);
  END IF;
 END IF;
 IF p_input->>'paymentType'='one_off' THEN
  IF c.archived_at IS NOT NULL THEN RAISE EXCEPTION 'CLIENT_ARCHIVED'; END IF;
  IF installment_id IS NOT NULL THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
  RETURN public.register_legacy_payment(p_owner_id,p_input);
 END IF;
 IF p_input->>'paymentType' IS DISTINCT FROM 'recurring' THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 IF installment_id IS NOT NULL THEN
  IF p_input->>'debtPaymentId' IS NOT NULL OR p_input->>'frequency' IS NOT NULL OR p_input->>'anchorDate' IS NOT NULL THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
  SELECT * INTO i FROM public.recurring_installments WHERE id=installment_id AND owner_id=p_owner_id AND recurring_installments.client_id=client_id AND currency=owner_currency FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_INSTALLMENT_DENIED'; END IF;
  IF agreement_id IS NOT NULL AND agreement_id<>i.recurring_agreement_id THEN RAISE EXCEPTION 'PAYMENT_AGREEMENT_DENIED'; END IF;
  SELECT * INTO a FROM public.recurring_agreements WHERE id=i.recurring_agreement_id AND owner_id=p_owner_id AND recurring_agreements.client_id=client_id FOR UPDATE;
 ELSIF p_input->>'frequency' IS NOT NULL THEN
  IF c.archived_at IS NOT NULL THEN RAISE EXCEPTION 'CLIENT_ARCHIVED'; END IF;
  SELECT * INTO a FROM public.recurring_agreements WHERE owner_id=p_owner_id AND recurring_agreements.client_id=client_id AND status IN ('pending','active','paused') FOR UPDATE;
  IF NOT FOUND THEN
   IF provider<>'manual' THEN RAISE EXCEPTION 'PAYMENT_AGREEMENT_DENIED'; END IF;
   result:=public.subscription_lifecycle(p_owner_id,client_id,'create',jsonb_build_object('frequency',p_input->>'frequency','anchorDate',p_input->>'anchorDate','amount',amount+discount+coalesce((p_input->>'debt')::numeric,0)));
   SELECT * INTO a FROM public.recurring_agreements WHERE id=(result->>'agreementId')::uuid;
  END IF;
  IF agreement_id IS NOT NULL AND a.id<>agreement_id THEN RAISE EXCEPTION 'PAYMENT_AGREEMENT_DENIED'; END IF;
  IF a.status<>'active' OR NOT a.installments_enabled THEN RAISE EXCEPTION 'REVIEW_REQUIRED: adopt legacy subscription explicitly or resume separately'; END IF;
  freq:=public.agreement_frequency(a.interval_unit,a.interval_count);
  IF freq IS DISTINCT FROM (p_input->>'frequency') OR a.billing_anchor_date IS DISTINCT FROM (p_input->>'anchorDate')::date THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_CONFLICT'; END IF;
  cycle:=coalesce((p_input->>'cycleDate')::date,a.billing_anchor_date);
  SELECT * INTO i FROM public.recurring_installments WHERE recurring_agreement_id=a.id AND due_date=cycle FOR UPDATE;
  IF NOT FOUND THEN
   PERFORM public.ensure_recurring_installments_through(p_owner_id,client_id,cycle);
   SELECT * INTO i FROM public.recurring_installments WHERE recurring_agreement_id=a.id AND due_date=cycle FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_INSTALLMENT_DENIED'; END IF;
  installment_id:=i.id;
 ELSE
  -- El debt legacy no se aplica a una cuota nueva ni borra deuda de otras obligaciones.
  IF p_input->>'debtPaymentId' IS NOT NULL AND EXISTS(SELECT 1 FROM public.payments WHERE id=(p_input->>'debtPaymentId')::uuid AND recurring_installment_id IS NOT NULL) THEN RAISE EXCEPTION 'PAYMENT_INSTALLMENT_DENIED'; END IF;
  IF c.archived_at IS NOT NULL AND p_input->>'debtPaymentId' IS NULL THEN RAISE EXCEPTION 'CLIENT_ARCHIVED'; END IF;
  IF p_input->>'debtPaymentId' IS NULL AND EXISTS(SELECT 1 FROM public.recurring_agreements WHERE owner_id=p_owner_id AND recurring_agreements.client_id=client_id AND installments_enabled AND status IN ('pending','active','paused')) THEN RAISE EXCEPTION 'PAYMENT_INSTALLMENT_DENIED'; END IF;
  IF p_input->>'debtPaymentId' IS NOT NULL AND c.legacy_debt_amount IS NOT NULL THEN
   SELECT * INTO saved FROM public.payments p WHERE p.id=(p_input->>'debtPaymentId')::uuid AND p.owner_id=p_owner_id AND p.client_id=client_id AND p.currency=owner_currency AND p.recurring_installment_id IS NULL AND p.allocation_selection IS NULL AND p.payment_type IS DISTINCT FROM 'one_off' AND p.debt>0;
   IF NOT FOUND OR provider<>'manual' OR amount+discount<=0 OR amount+discount>c.legacy_debt_amount OR saved.id IS DISTINCT FROM (SELECT p.id FROM public.payments p WHERE p.owner_id=p_owner_id AND p.client_id=client_id AND p.recurring_installment_id IS NULL AND p.allocation_selection IS NULL AND p.payment_type IS DISTINCT FROM 'one_off' ORDER BY p.created_at DESC,p.id DESC LIMIT 1) THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
   remaining:=c.legacy_debt_amount-amount-discount;
   INSERT INTO public.payments(owner_id,client_id,amount,discount,debt,plan,period_from,period_to,next_payment_date,provider,currency,payment_type,receipt_note)
    VALUES(p_owner_id,client_id,amount,discount,remaining,'Pago deuda',saved.period_from,saved.period_to,NULL,'manual',owner_currency,'recurring',p_input->>'receiptNote') RETURNING * INTO saved;
   UPDATE public.clients SET legacy_debt_amount=remaining,last_payment_amount=amount,last_payment_date=(saved.created_at AT TIME ZONE 'UTC')::date WHERE id=client_id;
   PERFORM public.refresh_installment_snapshot(p_owner_id,client_id);
   RETURN jsonb_build_object('payment',to_jsonb(saved),'duplicate',false);
  END IF;
  result:=public.register_legacy_payment(p_owner_id,p_input);
  IF c.legacy_debt_amount IS NOT NULL AND NOT (result->>'duplicate')::boolean THEN
   UPDATE public.clients SET legacy_debt_amount=CASE WHEN p_input->>'debtPaymentId' IS NOT NULL THEN greatest(c.legacy_debt_amount-amount-discount,0) ELSE (result->'payment'->>'debt')::numeric END WHERE id=client_id;
   PERFORM public.refresh_installment_snapshot(p_owner_id,client_id);
  END IF;
  RETURN result;
 END IF;
 IF a.provider IS DISTINCT FROM provider OR a.currency<>owner_currency OR a.payment_provider_account_id IS DISTINCT FROM account_id THEN RAISE EXCEPTION 'PAYMENT_AGREEMENT_DENIED'; END IF;
 IF c.archived_at IS NOT NULL AND i.due_date>today THEN RAISE EXCEPTION 'CLIENT_ARCHIVED'; END IF;
 IF amount+discount<=0 OR i.status<>'open' THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 covered:=public.installment_coverage(i.id);
 remaining:=i.amount_due-covered-amount-discount;
 IF remaining<0 THEN RAISE EXCEPTION 'INSTALLMENT_OVERALLOCATION'; END IF;
 freq:=public.agreement_frequency(a.interval_unit,a.interval_count);next_due:=CASE WHEN a.status='active' THEN public.payment_next_recurring_date(freq,a.billing_anchor_date,i.due_date) ELSE NULL END;
 IF (p_input->>'periodFrom' IS NOT NULL AND (p_input->>'periodFrom')::date<>i.period_from) OR (p_input->>'periodTo' IS NOT NULL AND (p_input->>'periodTo')::date<>i.period_to) THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_CONFLICT'; END IF;
 INSERT INTO public.payments(owner_id,client_id,amount,discount,debt,plan,period_from,period_to,next_payment_date,provider,currency,payment_type,concept,receipt_note,provider_payment_id,payment_provider_account_id,recurring_agreement_id,recurring_installment_id)
 VALUES(p_owner_id,client_id,amount,discount,remaining,coalesce(p_input->>'plan',CASE freq WHEN 'weekly' THEN 'Semanal' WHEN 'biweekly' THEN 'Quincenal' ELSE 'Mensual' END),i.period_from,i.period_to,next_due,provider,owner_currency,'recurring',p_input->>'concept',p_input->>'receiptNote',external_id,account_id,a.id,i.id) RETURNING * INTO saved;
 IF remaining=0 THEN UPDATE public.recurring_installments SET status='paid',paid_at=now() WHERE id=i.id; END IF;
 PERFORM public.refresh_installment_snapshot(p_owner_id,client_id);
 UPDATE public.clients SET last_payment_amount=amount,last_payment_date=(saved.created_at AT TIME ZONE 'UTC')::date WHERE id=client_id;
 RETURN jsonb_build_object('payment',to_jsonb(saved),'duplicate',false);
END $$;
CREATE OR REPLACE FUNCTION public.guard_recurring_billing_anchor() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.billing_anchor_date IS NOT NULL AND (NEW.billing_anchor_date IS DISTINCT FROM OLD.billing_anchor_date OR NEW.interval_unit IS DISTINCT FROM OLD.interval_unit OR NEW.interval_count IS DISTINCT FROM OLD.interval_count) AND current_setting('isipici.edit_plan',true) IS DISTINCT FROM OLD.id::text THEN RAISE EXCEPTION 'PAYMENT_ANCHOR_IMMUTABLE'; END IF;
 RETURN NEW;
END; $$;
ALTER FUNCTION public.register_canonical_payment(uuid,jsonb) RENAME TO register_installment_payment_v13;
CREATE FUNCTION public.register_canonical_payment(p_owner_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE c public.clients%ROWTYPE;a public.recurring_agreements%ROWTYPE;i public.recurring_installments%ROWTYPE;p public.payments%ROWTYPE;
 ids uuid[];cash numeric:=(p_input->>'amount')::numeric;bonus numeric:=coalesce((p_input->>'discount')::numeric,0);cash_left numeric;bonus_left numeric;balance numeric;cash_part numeric;bonus_part numeric;total numeric:=0;cur text;client uuid:=(p_input->>'clientId')::uuid;external text:=nullif(p_input->>'providerPaymentId','');provider text:=p_input->>'provider';account uuid:=(p_input->>'providerAccountId')::uuid;
BEGIN
 IF coalesce(jsonb_array_length(p_input->'selectedInstallmentIds'),0)=0 THEN RETURN public.register_installment_payment_v13(p_owner_id,p_input); END IF;
 c:=public.lifecycle_client_lock(p_owner_id,client);
 SELECT default_currency INTO cur FROM public.owners WHERE id=p_owner_id;
 IF p_input->>'currency' IS DISTINCT FROM cur THEN RAISE EXCEPTION 'PAYMENT_CURRENCY_CONFLICT'; END IF;
 IF p_input->>'paymentType' IS DISTINCT FROM 'recurring' OR p_input->>'frequency' IS NOT NULL OR p_input->>'debtPaymentId' IS NOT NULL OR p_input->>'recurringInstallmentId' IS NOT NULL OR p_input->>'anchorDate' IS NOT NULL OR p_input->>'cycleDate' IS NOT NULL OR p_input->>'periodFrom' IS NOT NULL OR p_input->>'periodTo' IS NOT NULL OR p_input->>'serviceDate' IS NOT NULL OR coalesce((p_input->>'debt')::numeric,0)<>0 OR cash IS NULL OR cash<0 OR bonus<0 OR cash+bonus<=0 OR cash>1e12 OR bonus>1e12 OR cash<>round(cash,2) OR bonus<>round(bonus,2) THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 SELECT array_agg(value::uuid ORDER BY value) INTO ids FROM jsonb_array_elements_text(p_input->'selectedInstallmentIds');
 IF cardinality(ids)>100 OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 IF provider IS NULL OR provider NOT IN ('manual','stripe','mercadopago') THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 IF provider='manual' THEN IF external IS NOT NULL OR account IS NOT NULL THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 ELSE IF external IS NULL OR NOT EXISTS(SELECT 1 FROM public.payment_provider_accounts WHERE id=account AND owner_id=p_owner_id AND payment_provider_accounts.provider=provider AND status='connected' AND default_currency=cur) THEN RAISE EXCEPTION 'PAYMENT_ACCOUNT_DENIED'; END IF; END IF;
 IF external IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(provider||':'||external,0));
  SELECT * INTO p FROM public.payments WHERE payments.provider=provider AND provider_payment_id=external;
  IF FOUND THEN
   IF p.owner_id<>p_owner_id OR p.client_id<>client OR p.currency<>cur OR p.amount<>cash OR p.discount<>bonus OR p.payment_type IS DISTINCT FROM 'recurring' OR p.payment_provider_account_id IS DISTINCT FROM account OR p.receipt_note IS DISTINCT FROM (p_input->>'receiptNote') OR p.concept IS DISTINCT FROM (p_input->>'concept') OR p.allocation_selection IS DISTINCT FROM to_jsonb(ids) OR p.allocation_intent IS DISTINCT FROM (p_input||jsonb_build_object('selectedInstallmentIds',to_jsonb(ids))) THEN RAISE EXCEPTION 'PAYMENT_ID_CONFLICT'; END IF;
   RETURN jsonb_build_object('payment',to_jsonb(p),'duplicate',true);
  END IF;
 END IF;
 IF (SELECT count(*) FROM public.recurring_installments WHERE id=ANY(ids) AND owner_id=p_owner_id AND client_id=client AND currency=cur)<>cardinality(ids) THEN RAISE EXCEPTION 'PAYMENT_INSTALLMENT_DENIED'; END IF;
 SELECT * INTO a FROM public.recurring_agreements WHERE id=(SELECT recurring_agreement_id FROM public.recurring_installments WHERE id=ids[1]) AND owner_id=p_owner_id AND client_id=client FOR UPDATE;
 IF a.provider IS DISTINCT FROM provider OR a.payment_provider_account_id IS DISTINCT FROM account OR (p_input->>'recurringAgreementId' IS NOT NULL AND a.id<>(p_input->>'recurringAgreementId')::uuid) THEN RAISE EXCEPTION 'PAYMENT_AGREEMENT_DENIED'; END IF;
 FOR i IN SELECT * FROM public.recurring_installments WHERE id=ANY(ids) ORDER BY due_date,id FOR UPDATE LOOP
  IF i.recurring_agreement_id<>a.id OR i.status<>'open' OR (c.archived_at IS NOT NULL AND i.due_date>(now() AT TIME ZONE 'UTC')::date) THEN RAISE EXCEPTION 'PAYMENT_INSTALLMENT_DENIED'; END IF;
  balance:=i.amount_due-public.installment_coverage(i.id);IF balance<=0 THEN RAISE EXCEPTION 'PAYMENT_INSTALLMENT_DENIED'; END IF;total:=total+balance;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.recurring_installments x WHERE x.recurring_agreement_id=a.id AND x.status='open' AND x.due_date<(SELECT max(due_date) FROM public.recurring_installments WHERE id=ANY(ids)) AND NOT(x.id=ANY(ids)) AND public.installment_coverage(x.id)<x.amount_due) THEN RAISE EXCEPTION 'OLDER_INSTALLMENTS_REQUIRED'; END IF;
 IF cash+bonus>total THEN RAISE EXCEPTION 'INSTALLMENT_OVERALLOCATION'; END IF;
 INSERT INTO public.payments(owner_id,client_id,amount,discount,debt,plan,concept,receipt_note,provider,currency,payment_type,recurring_agreement_id,payment_provider_account_id,provider_payment_id,allocation_selection,allocation_intent)
 VALUES(p_owner_id,client,cash,bonus,total-cash-bonus,coalesce(nullif(p_input->>'plan',''),a.plan_name,public.agreement_frequency(a.interval_unit,a.interval_count)),p_input->>'concept',p_input->>'receiptNote',provider,cur,'recurring',a.id,account,external,to_jsonb(ids),p_input||jsonb_build_object('selectedInstallmentIds',to_jsonb(ids))) RETURNING * INTO p;
 cash_left:=cash;bonus_left:=bonus;
 FOR i IN SELECT * FROM public.recurring_installments WHERE id=ANY(ids) ORDER BY due_date,id FOR UPDATE LOOP
  balance:=i.amount_due-public.installment_coverage(i.id);cash_part:=least(cash_left,balance);bonus_part:=least(bonus_left,balance-cash_part);
  IF cash_part+bonus_part>0 THEN
   INSERT INTO public.payment_allocations(owner_id,client_id,payment_id,recurring_installment_id,recurring_agreement_id,currency,amount_applied,discount_applied) VALUES(p_owner_id,client,p.id,i.id,a.id,cur,cash_part,bonus_part);
   IF public.installment_coverage(i.id)=i.amount_due THEN UPDATE public.recurring_installments SET status='paid',paid_at=now() WHERE id=i.id; END IF;
  END IF;cash_left:=cash_left-cash_part;bonus_left:=bonus_left-bonus_part;
 END LOOP;
 PERFORM public.refresh_installment_snapshot(p_owner_id,client);
 UPDATE public.clients SET last_payment_amount=cash,last_payment_date=(p.created_at AT TIME ZONE 'UTC')::date WHERE id=client;
 RETURN jsonb_build_object('payment',to_jsonb(p),'duplicate',false);
END $$;
CREATE FUNCTION public.recurring_calendar(p_owner uuid,p_client uuid,p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.clients%ROWTYPE;rows jsonb;effective date;
BEGIN
 c:=public.lifecycle_client_lock(p_owner,p_client);
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>70 OR p_to>(now() AT TIME ZONE 'UTC')::date+180 THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 PERFORM public.ensure_recurring_installments_through(p_owner,p_client,p_to);
 SELECT coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('covered_amount',public.installment_coverage(i.id),'remaining',CASE WHEN i.status='open' THEN greatest(i.amount_due-public.installment_coverage(i.id),0) ELSE 0 END,'overdue',i.status='open' AND i.due_date<(now() AT TIME ZONE 'UTC')::date AND public.installment_coverage(i.id)<i.amount_due,'partially_paid',i.status='open' AND public.installment_coverage(i.id)>0 AND public.installment_coverage(i.id)<i.amount_due) ORDER BY i.due_date,i.id),'[]'::jsonb) INTO rows FROM public.recurring_installments i WHERE owner_id=p_owner AND client_id=p_client AND ((period_to>=p_from AND period_from<=p_to) OR (status='open' AND due_date<p_from));
 SELECT greatest((now() AT TIME ZONE 'UTC')::date+1,coalesce(max(i.period_to)+1,(now() AT TIME ZONE 'UTC')::date+1)) INTO effective FROM public.recurring_installments i JOIN public.recurring_agreements a ON a.id=i.recurring_agreement_id WHERE i.owner_id=p_owner AND i.client_id=p_client AND a.status IN ('active','paused') AND (i.due_date<=(now() AT TIME ZONE 'UTC')::date OR i.status IN ('paid','waived') OR public.installment_coverage(i.id)>0);
 SELECT coalesce(min(i.due_date),effective) INTO effective FROM public.recurring_installments i JOIN public.recurring_agreements a ON a.id=i.recurring_agreement_id WHERE i.owner_id=p_owner AND i.client_id=p_client AND a.status IN ('active','paused') AND i.status='open' AND i.due_date>=effective AND public.installment_coverage(i.id)=0;
 RETURN jsonb_build_object('installments',rows,'editEffectiveDate',effective);
END $$;
CREATE FUNCTION public.payment_receipt_allocations(p_owner uuid,p_payment uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('periodFrom',i.period_from,'periodTo',i.period_to,'amountApplied',a.amount_applied,'discountApplied',a.discount_applied,'remaining',CASE WHEN i.status='open' THEN greatest(i.amount_due-public.installment_coverage(i.id),0) ELSE 0 END) ORDER BY i.due_date,i.id),'[]'::jsonb) FROM public.payment_allocations a JOIN public.recurring_installments i ON i.id=a.recurring_installment_id JOIN public.payments p ON p.id=a.payment_id WHERE a.owner_id=p_owner AND p.owner_id=p_owner AND p.id=p_payment;
$$;
CREATE OR REPLACE FUNCTION public.dashboard_client_summary(p_owner uuid,p_archived boolean,p_month_start timestamptz,p_month_end timestamptz,p_today date)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE currency text; owner_column text; result jsonb;
BEGIN
 SELECT default_currency INTO currency FROM public.owners WHERE id=p_owner AND is_active=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_OWNER_DENIED'; END IF;
 IF p_month_start IS NULL OR p_month_end IS NULL OR p_month_end<=p_month_start OR p_month_end>p_month_start+interval '32 days' OR p_today IS NULL THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='owner_id') THEN 'owner_id' ELSE 'gym_id' END INTO owner_column;
 -- Column name comes exclusively from this allowlist, never from an HTTP request.
 EXECUTE format($query$
 WITH selected AS MATERIALIZED (
  SELECT c.id,c.name,c.email,c.phone,c.address,c.address_number,c.created_at,c.current_debt,c.archived_at,c.legacy_debt_amount,c.next_payment_date FROM public.clients c WHERE c.%I=$1 AND (c.archived_at IS NOT NULL)=$5
 ), monthly AS (
  SELECT p.client_id,sum(p.amount) total FROM public.payments p JOIN selected c ON c.id=p.client_id
  WHERE p.owner_id=$1 AND p.currency=$6 AND p.created_at >= $2 AND p.created_at < $3 GROUP BY p.client_id
 ), balances AS (
  SELECT i.client_id,sum(greatest(i.amount_due-coalesce(covered.total,0),0)) debt
  FROM public.recurring_installments i JOIN selected c ON c.id=i.client_id
  LEFT JOIN LATERAL (SELECT public.installment_coverage(i.id) total) covered ON true
  WHERE i.owner_id=$1 AND i.status='open' AND i.due_date<=$4 GROUP BY i.client_id
 ), agreement_states AS (
  SELECT a.client_id,bool_or(a.status='active') active FROM public.recurring_agreements a JOIN selected c ON c.id=a.client_id WHERE a.owner_id=$1 GROUP BY a.client_id
 )
 SELECT coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
  'last_payment',to_jsonb(last_payment),'last_recurring',to_jsonb(last_recurring),
  'total_paid_this_month',coalesce(m.total,0),'installment_debt',coalesce(b.debt,0),
  'has_agreements',a.client_id IS NOT NULL,'has_active_agreement',coalesce(a.active,false)
 ) ORDER BY c.created_at,c.id),'[]'::jsonb)
 FROM selected c
 LEFT JOIN LATERAL (SELECT p.id,p.created_at FROM public.payments p WHERE p.owner_id=$1 AND p.client_id=c.id ORDER BY p.created_at DESC,p.id DESC LIMIT 1) last_payment ON true
 LEFT JOIN LATERAL (SELECT p.id,p.created_at,p.plan,p.debt,p.next_payment_date,p.period_to FROM public.payments p WHERE p.owner_id=$1 AND p.client_id=c.id AND p.payment_type IS DISTINCT FROM 'one_off' ORDER BY p.created_at DESC,p.id DESC LIMIT 1) last_recurring ON true
 LEFT JOIN monthly m ON m.client_id=c.id LEFT JOIN balances b ON b.client_id=c.id LEFT JOIN agreement_states a ON a.client_id=c.id
 $query$,owner_column) INTO result USING p_owner,p_month_start,p_month_end,p_today,p_archived,currency;
 RETURN jsonb_build_object('currency',currency,'clients',result);
END $$;

DO $$ DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('installment_coverage','guard_payment_allocation','check_payment_allocation_total','legacy_payment_allocation','edit_recurring_plan','register_installment_payment_v13','register_canonical_payment','recurring_calendar','payment_receipt_allocations') LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated';EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.signature||' TO service_role';END LOOP;END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
