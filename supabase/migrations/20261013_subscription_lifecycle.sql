-- Aplicar manualmente después de 10/11/12. No reconstruye historia financiera.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.recurring_agreements WHERE status IN ('pending','active','paused') GROUP BY owner_id,client_id HAVING count(*)>1) THEN
 RAISE EXCEPTION 'REVIEW_REQUIRED: duplicate current agreements; reconcile manually before migration'; END IF;
END $$;
DROP INDEX public.recurring_manual_schedule_active_unique;
CREATE UNIQUE INDEX recurring_one_current ON public.recurring_agreements(owner_id,client_id) WHERE status IN ('pending','active','paused');
ALTER TABLE public.clients ADD COLUMN archived_at timestamptz, ADD COLUMN legacy_debt_amount numeric(14,2) CHECK(legacy_debt_amount>=0);
ALTER TABLE public.recurring_agreements ADD COLUMN installments_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.recurring_agreements ADD CONSTRAINT agreement_installment_context_unique UNIQUE(id,owner_id,client_id,currency);
CREATE TABLE public.recurring_installments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT, recurring_agreement_id uuid NOT NULL,
 due_date date NOT NULL, period_from date NOT NULL, period_to date NOT NULL,
 amount_due numeric(14,2) NOT NULL CHECK(amount_due>0), currency text NOT NULL CHECK(currency IN ('ARS','AUD')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid','waived','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),paid_at timestamptz,cancelled_at timestamptz,waived_at timestamptz,
 CHECK(period_from=due_date AND period_to>=period_from), UNIQUE(recurring_agreement_id,due_date),
 UNIQUE(id,owner_id,client_id,recurring_agreement_id,currency),
 FOREIGN KEY(recurring_agreement_id,owner_id,client_id,currency) REFERENCES public.recurring_agreements(id,owner_id,client_id,currency) ON DELETE RESTRICT
);
CREATE INDEX installment_owner_due ON public.recurring_installments(owner_id,client_id,due_date) WHERE status='open';
ALTER TABLE public.recurring_installments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recurring_installments FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.recurring_installments TO service_role;
CREATE TRIGGER installments_updated_at BEFORE UPDATE ON public.recurring_installments FOR EACH ROW EXECUTE FUNCTION public.payment_domain_updated_at();
ALTER TABLE public.payments ADD COLUMN recurring_installment_id uuid,
 ADD CONSTRAINT payment_installment_context_fk FOREIGN KEY(recurring_installment_id,owner_id,client_id,recurring_agreement_id,currency)
 REFERENCES public.recurring_installments(id,owner_id,client_id,recurring_agreement_id,currency) ON DELETE RESTRICT,
 ADD CONSTRAINT payment_installment_required_context CHECK(recurring_installment_id IS NULL OR (payment_type IS NOT DISTINCT FROM 'recurring' AND recurring_agreement_id IS NOT NULL)),
 ADD CONSTRAINT one_off_no_installment CHECK(payment_type IS DISTINCT FROM 'one_off' OR recurring_installment_id IS NULL);
CREATE INDEX payment_installment_idx ON public.payments(recurring_installment_id);
-- DB defensa adicional: el flujo normal nunca destruye clientes, aunque existan FKs legacy CASCADE.
CREATE FUNCTION public.prevent_client_hard_delete() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'CLIENT_ARCHIVE_REQUIRED'; END $$;
CREATE TRIGGER clients_no_hard_delete BEFORE DELETE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.prevent_client_hard_delete();
CREATE FUNCTION public.lifecycle_client_lock(p_owner uuid,p_client uuid) RETURNS public.clients LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.clients%ROWTYPE;
BEGIN
 PERFORM 1 FROM public.owners WHERE id=p_owner AND is_active=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_OWNER_DENIED'; END IF;
 SELECT * INTO c FROM public.clients WHERE id=p_client FOR UPDATE;
 IF NOT FOUND OR coalesce(to_jsonb(c)->>'owner_id',to_jsonb(c)->>'gym_id') IS DISTINCT FROM p_owner::text THEN RAISE EXCEPTION 'PAYMENT_OWNER_DENIED'; END IF;
 RETURN c;
END $$;
CREATE FUNCTION public.agreement_frequency(p_unit text,p_count integer) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF p_unit='week' AND p_count=1 THEN RETURN 'weekly'; ELSIF p_unit='week' AND p_count=2 THEN RETURN 'biweekly'; ELSIF p_unit='month' AND p_count=1 THEN RETURN 'monthly'; END IF;
 RAISE EXCEPTION 'REVIEW_REQUIRED: unsupported legacy cadence';
END $$;
CREATE FUNCTION public.refresh_installment_snapshot(p_owner uuid,p_client uuid) RETURNS numeric LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.clients%ROWTYPE; total numeric; next_due date;
BEGIN
 c:=public.lifecycle_client_lock(p_owner,p_client);
 SELECT coalesce(sum(greatest(i.amount_due-coalesce((SELECT sum(p.amount+p.discount) FROM public.payments p WHERE p.recurring_installment_id=i.id),0),0)),0) INTO total
 FROM public.recurring_installments i WHERE i.owner_id=p_owner AND i.client_id=p_client AND i.status='open' AND i.due_date<=(now() AT TIME ZONE 'UTC')::date;
 SELECT least((SELECT min(i.due_date) FROM public.recurring_installments i JOIN public.recurring_agreements a ON a.id=i.recurring_agreement_id
  WHERE i.owner_id=p_owner AND i.client_id=p_client AND i.status='open' AND a.status='active'),
  (SELECT (a.next_charge_at AT TIME ZONE 'UTC')::date FROM public.recurring_agreements a WHERE a.owner_id=p_owner AND a.client_id=p_client AND a.status='active' AND a.installments_enabled)) INTO next_due;
 total:=coalesce(c.legacy_debt_amount,c.current_debt,0)+total;
 UPDATE public.clients SET legacy_debt_amount=coalesce(c.legacy_debt_amount,c.current_debt,0),current_debt=total,
 next_payment_date=CASE WHEN EXISTS(SELECT 1 FROM public.recurring_agreements a WHERE a.owner_id=p_owner AND a.client_id=p_client AND a.installments_enabled) THEN next_due ELSE c.next_payment_date END WHERE id=p_client;
 RETURN total;
END $$;
CREATE FUNCTION public.ensure_recurring_installments_through(p_owner uuid,p_client uuid,p_through date) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.clients%ROWTYPE; a public.recurring_agreements%ROWTYPE; cursor_date date; next_due date; freq text; generated integer:=0;
BEGIN
 c:=public.lifecycle_client_lock(p_owner,p_client);
 IF p_through IS NULL OR p_through>(now() AT TIME ZONE 'UTC')::date+90 THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
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
   VALUES(p_owner,p_client,a.id,cursor_date,cursor_date,next_due-1,a.amount,a.currency) ON CONFLICT(recurring_agreement_id,due_date) DO NOTHING;
  cursor_date:=next_due;generated:=generated+1;
 END LOOP;
 UPDATE public.recurring_agreements SET next_charge_at=cursor_date::timestamp AT TIME ZONE 'UTC' WHERE id=a.id;
 PERFORM public.refresh_installment_snapshot(p_owner,p_client);
 RETURN generated;
END $$;
CREATE FUNCTION public.subscription_lifecycle(p_owner uuid,p_client uuid,p_action text,p_input jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
    AND NOT EXISTS(SELECT 1 FROM public.payments p WHERE p.recurring_installment_id=i.id AND p.amount+p.discount>0);
  END IF;
  PERFORM public.refresh_installment_snapshot(p_owner,p_client); RETURN jsonb_build_object('ok',true);
 END IF;
 IF c.archived_at IS NOT NULL THEN RAISE EXCEPTION 'CLIENT_ARCHIVED'; END IF;
 IF p_action IN ('pause','resume','cancel','change','adopt') THEN
  IF a.id IS NULL OR a.id IS DISTINCT FROM (p_input->>'agreementId')::uuid THEN RAISE EXCEPTION 'PAYMENT_AGREEMENT_DENIED'; END IF;
  IF a.provider<>'manual' THEN RAISE EXCEPTION 'PROVIDER_LIFECYCLE_UNAVAILABLE'; END IF;
 END IF;
 IF p_action IN ('pause','cancel','change') THEN
  UPDATE public.recurring_agreements SET status=CASE WHEN p_action='pause' THEN 'paused' ELSE 'cancelled' END,
   cancelled_at=CASE WHEN p_action='pause' THEN cancelled_at ELSE now() END WHERE id=a.id;
  UPDATE public.recurring_installments i SET status='cancelled',cancelled_at=now() WHERE recurring_agreement_id=a.id AND status='open' AND due_date>today
   AND NOT EXISTS(SELECT 1 FROM public.payments p WHERE p.recurring_installment_id=i.id AND p.amount+p.discount>0);
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
   VALUES(p_owner,p_client,a.id,first_due,first_due,next_due-1,a.amount,a.currency) ON CONFLICT(recurring_agreement_id,due_date) DO NOTHING;
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
CREATE FUNCTION public.waive_recurring_installment(p_owner uuid,p_client uuid,p_installment uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM public.lifecycle_client_lock(p_owner,p_client);
 UPDATE public.recurring_installments SET status='waived',waived_at=now() WHERE id=p_installment AND owner_id=p_owner AND client_id=p_client AND status='open';
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_INSTALLMENT_DENIED'; END IF;
 PERFORM public.refresh_installment_snapshot(p_owner,p_client);
END $$;
CREATE FUNCTION public.guard_installment_payment() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE i public.recurring_installments%ROWTYPE; covered numeric;
BEGIN
 IF TG_OP<>'INSERT' THEN
  IF OLD.recurring_installment_id IS NOT NULL THEN RAISE EXCEPTION 'INSTALLMENT_PAYMENT_IMMUTABLE'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.recurring_installment_id IS NOT NULL THEN RAISE EXCEPTION 'INSTALLMENT_PAYMENT_IMMUTABLE'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.recurring_installment_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO i FROM public.recurring_installments WHERE id=NEW.recurring_installment_id FOR UPDATE;
 IF NOT FOUND OR i.owner_id<>NEW.owner_id OR i.client_id<>NEW.client_id OR i.recurring_agreement_id IS DISTINCT FROM NEW.recurring_agreement_id OR i.currency<>NEW.currency THEN RAISE EXCEPTION 'PAYMENT_INSTALLMENT_DENIED'; END IF;
 IF i.status<>'open' OR NEW.amount<0 OR NEW.discount<0 OR NEW.amount+NEW.discount<=0 THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 SELECT coalesce(sum(amount+discount),0) INTO covered FROM public.payments WHERE recurring_installment_id=i.id;
 IF covered+NEW.amount+NEW.discount>i.amount_due THEN RAISE EXCEPTION 'INSTALLMENT_OVERALLOCATION'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_installment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.guard_installment_payment();
-- La implementación previa se conserva exclusivamente como adaptador legacy.
ALTER FUNCTION public.register_canonical_payment(uuid,jsonb) RENAME TO register_legacy_payment;
CREATE FUNCTION public.register_canonical_payment(p_owner_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
   SELECT * INTO saved FROM public.payments p WHERE p.id=(p_input->>'debtPaymentId')::uuid AND p.owner_id=p_owner_id AND p.client_id=client_id AND p.currency=owner_currency AND p.recurring_installment_id IS NULL AND p.payment_type IS DISTINCT FROM 'one_off' AND p.debt>0;
   IF NOT FOUND OR provider<>'manual' OR amount+discount<=0 OR amount+discount>c.legacy_debt_amount OR saved.id IS DISTINCT FROM (SELECT p.id FROM public.payments p WHERE p.owner_id=p_owner_id AND p.client_id=client_id AND p.recurring_installment_id IS NULL AND p.payment_type IS DISTINCT FROM 'one_off' ORDER BY p.created_at DESC,p.id DESC LIMIT 1) THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
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
 SELECT coalesce(sum(p.amount+p.discount),0) INTO covered FROM public.payments p WHERE p.recurring_installment_id=i.id;
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
-- Ninguna función nueva se expone a roles del navegador.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
 ('prevent_client_hard_delete','lifecycle_client_lock','agreement_frequency','refresh_installment_snapshot','ensure_recurring_installments_through','subscription_lifecycle','waive_recurring_installment','guard_installment_payment','register_legacy_payment','register_canonical_payment') LOOP
 EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated';
 EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.signature||' TO service_role';
 END LOOP;
END $$;
CREATE FUNCTION public.guard_subscription_lifecycle() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.clients%ROWTYPE;
BEGIN
 SELECT * INTO c FROM public.clients WHERE id=NEW.client_id FOR SHARE;
 IF c.archived_at IS NOT NULL AND NEW.status IN ('pending','active') THEN RAISE EXCEPTION 'CLIENT_ARCHIVED'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status IN ('cancelled','failed') AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'SUBSCRIPTION_TERMINAL'; END IF;
  IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.provider IS DISTINCT FROM OLD.provider OR NEW.owner_id<>OLD.owner_id OR NEW.client_id<>OLD.client_id THEN RAISE EXCEPTION 'SUBSCRIPTION_CONFIG_IMMUTABLE'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER subscription_lifecycle_guard BEFORE INSERT OR UPDATE ON public.recurring_agreements FOR EACH ROW EXECUTE FUNCTION public.guard_subscription_lifecycle();
REVOKE ALL ON FUNCTION public.guard_subscription_lifecycle() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_subscription_lifecycle() TO service_role;
CREATE FUNCTION public.guard_installment_obligation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.recurring_agreements%ROWTYPE; covered numeric; today date:=(now() AT TIME ZONE 'UTC')::date;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'INSTALLMENT_HISTORY_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.client_id<>OLD.client_id OR NEW.recurring_agreement_id<>OLD.recurring_agreement_id OR NEW.currency<>OLD.currency OR NEW.amount_due<>OLD.amount_due OR NEW.due_date<>OLD.due_date OR NEW.period_from<>OLD.period_from OR NEW.period_to<>OLD.period_to THEN RAISE EXCEPTION 'INSTALLMENT_HISTORY_IMMUTABLE'; END IF;
  IF OLD.status<>'open' AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'INSTALLMENT_TERMINAL'; END IF;
  SELECT coalesce(sum(amount+discount),0) INTO covered FROM public.payments WHERE recurring_installment_id=OLD.id;
  IF NEW.status='paid' AND covered<>NEW.amount_due THEN RAISE EXCEPTION 'INSTALLMENT_NOT_SETTLED'; END IF;
  IF OLD.status='open' AND NEW.status='cancelled' AND (OLD.due_date<=today OR covered>0) THEN RAISE EXCEPTION 'INSTALLMENT_DEBT_PRESERVED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER installment_obligation_guard BEFORE UPDATE OR DELETE ON public.recurring_installments FOR EACH ROW EXECUTE FUNCTION public.guard_installment_obligation();
REVOKE ALL ON FUNCTION public.guard_installment_obligation() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_installment_obligation() TO service_role;
COMMIT;
