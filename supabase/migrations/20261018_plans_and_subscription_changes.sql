-- Milestone 5.4. Apply manually after 17. No historical plan inference.
BEGIN;
CREATE TABLE public.plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.owners(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200), frequency text NOT NULL CHECK(frequency IN ('weekly','biweekly','monthly')),
 archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,owner_id)
);
CREATE TABLE public.plan_prices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),plan_id uuid NOT NULL,owner_id uuid NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>0 AND amount<=1e12),currency text NOT NULL CHECK(currency IN ('ARS','AUD')),
 effective_from date NOT NULL CHECK(effective_from>=DATE '1900-01-01'),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(plan_id,owner_id) REFERENCES public.plans(id,owner_id), UNIQUE(plan_id,effective_from),UNIQUE(id,owner_id)
);
ALTER TABLE public.recurring_agreements ADD COLUMN plan_id uuid,
 ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false, ADD COLUMN cancellation_boundary date,
 ADD CONSTRAINT agreement_plan_owner_fk FOREIGN KEY(plan_id,owner_id) REFERENCES public.plans(id,owner_id),
 ADD CONSTRAINT agreement_identity_owner_client UNIQUE(id,owner_id,client_id),
 ADD CONSTRAINT agreement_cancellation_boundary CHECK(cancel_at_period_end=(cancellation_boundary IS NOT NULL));
CREATE TABLE public.subscription_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL,client_id uuid NOT NULL,recurring_agreement_id uuid NOT NULL,
 source_plan_id uuid,target_plan_id uuid,new_plan_name text CHECK(length(new_plan_name)<=200),
 new_amount numeric(14,2) NOT NULL CHECK(new_amount>0 AND new_amount<=1e12),currency text NOT NULL CHECK(currency IN ('ARS','AUD')),
 new_frequency text NOT NULL CHECK(new_frequency IN ('weekly','biweekly','monthly')),effective_from date NOT NULL,
 starts_on date NOT NULL,status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','applied','cancelled')),
 price_id uuid,created_at timestamptz NOT NULL DEFAULT now(),applied_at timestamptz,cancelled_at timestamptz,
 FOREIGN KEY(recurring_agreement_id,owner_id,client_id) REFERENCES public.recurring_agreements(id,owner_id,client_id),
 FOREIGN KEY(source_plan_id,owner_id) REFERENCES public.plans(id,owner_id),
 FOREIGN KEY(target_plan_id,owner_id) REFERENCES public.plans(id,owner_id),
 FOREIGN KEY(price_id,owner_id) REFERENCES public.plan_prices(id,owner_id),CHECK(starts_on>=effective_from)
);
CREATE UNIQUE INDEX subscription_one_scheduled ON public.subscription_changes(recurring_agreement_id) WHERE status='scheduled';
CREATE UNIQUE INDEX subscription_change_price_once ON public.subscription_changes(recurring_agreement_id,price_id) WHERE price_id IS NOT NULL;
CREATE INDEX plans_owner_active ON public.plans(owner_id,archived_at);
CREATE INDEX changes_owner_client ON public.subscription_changes(owner_id,client_id,status);
CREATE INDEX agreements_plan_owner ON public.recurring_agreements(owner_id,plan_id,status);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plans,public.plan_prices,public.subscription_changes FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.plans,public.plan_prices,public.subscription_changes TO service_role;
CREATE TRIGGER plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.payment_domain_updated_at();
CREATE FUNCTION public.guard_plan_catalog() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PLAN_HISTORY_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.owner_id<>OLD.owner_id OR NEW.id<>OLD.id THEN RAISE EXCEPTION 'PLAN_HISTORY_IMMUTABLE'; END IF;
  IF NEW.frequency<>OLD.frequency AND (EXISTS(SELECT 1 FROM public.recurring_agreements WHERE plan_id=OLD.id) OR EXISTS(SELECT 1 FROM public.subscription_changes WHERE source_plan_id=OLD.id OR target_plan_id=OLD.id)) THEN RAISE EXCEPTION 'PLAN_FREQUENCY_USED'; END IF;
 END IF;
 PERFORM 1 FROM public.owners WHERE id=NEW.owner_id AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_OWNER_DENIED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER plan_guard BEFORE INSERT OR UPDATE OR DELETE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.guard_plan_catalog();
CREATE FUNCTION public.guard_plan_price() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE configured text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'PLAN_PRICE_IMMUTABLE'; END IF;
 SELECT default_currency INTO configured FROM public.owners WHERE id=NEW.owner_id AND is_active FOR UPDATE;
 IF NOT FOUND OR NEW.currency<>configured THEN RAISE EXCEPTION 'PAYMENT_CURRENCY_CONFLICT'; END IF;
 PERFORM 1 FROM public.plans WHERE id=NEW.plan_id AND owner_id=NEW.owner_id AND (archived_at IS NULL OR current_setting('isipici.edit_plan',true)=NEW.id::text) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_UNAVAILABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER price_guard BEFORE INSERT OR UPDATE OR DELETE ON public.plan_prices FOR EACH ROW EXECUTE FUNCTION public.guard_plan_price();
CREATE OR REPLACE FUNCTION public.guard_owner_currency() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.default_currency IS DISTINCT FROM OLD.default_currency AND (
 EXISTS(SELECT 1 FROM public.payments WHERE owner_id=OLD.id) OR EXISTS(SELECT 1 FROM public.recurring_agreements WHERE owner_id=OLD.id)
 OR EXISTS(SELECT 1 FROM public.payment_provider_accounts WHERE owner_id=OLD.id) OR EXISTS(SELECT 1 FROM public.plans WHERE owner_id=OLD.id)
 OR EXISTS(SELECT 1 FROM public.plan_prices WHERE owner_id=OLD.id)
 OR EXISTS(SELECT 1 FROM public.clients c WHERE coalesce(to_jsonb(c)->>'owner_id',to_jsonb(c)->>'gym_id')=OLD.id::text AND coalesce(c.current_debt,0)<>0)
 ) THEN RAISE EXCEPTION 'OWNER_CURRENCY_LOCKED'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.resolve_plan(p_owner uuid,p_plan uuid,p_date date) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p public.plans%ROWTYPE; price public.plan_prices%ROWTYPE;
BEGIN
 PERFORM 1 FROM public.owners WHERE id=p_owner AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_OWNER_DENIED'; END IF;
 SELECT * INTO p FROM public.plans WHERE id=p_plan AND owner_id=p_owner AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_UNAVAILABLE'; END IF;
 SELECT * INTO price FROM public.plan_prices WHERE plan_id=p.id AND owner_id=p_owner AND effective_from<=p_date ORDER BY effective_from DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_PRICE_UNAVAILABLE'; END IF;
 RETURN jsonb_build_object('planId',p.id,'planName',p.name,'frequency',p.frequency,'amount',price.amount,'currency',price.currency,'priceId',price.id);
END $$;
CREATE FUNCTION public.subscription_change_start(p_agreement uuid,p_effective date) RETURNS date LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.recurring_agreements%ROWTYPE; protected_end date; candidate date; freq text; floor_date date; steps integer:=0;
BEGIN
 SELECT * INTO a FROM public.recurring_agreements WHERE id=p_agreement FOR UPDATE;
 IF NOT FOUND OR a.billing_anchor_date IS NULL THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_CONFLICT'; END IF;
 SELECT max(period_to) INTO protected_end FROM public.recurring_installments i WHERE recurring_agreement_id=a.id
 AND status<>'cancelled' AND (due_date<=(now() AT TIME ZONE 'UTC')::date OR status IN ('paid','waived') OR public.installment_coverage(id)>0);
 floor_date:=greatest(p_effective,(now() AT TIME ZONE 'UTC')::date+1,coalesce(protected_end+1,p_effective));
 freq:=public.agreement_frequency(a.interval_unit,a.interval_count);
 candidate:=a.billing_anchor_date;
 WHILE candidate<floor_date LOOP
  candidate:=public.payment_next_recurring_date(freq,a.billing_anchor_date,candidate);steps:=steps+1;
  IF steps>10000 THEN RAISE EXCEPTION 'REVIEW_REQUIRED: schedule catchup'; END IF;
 END LOOP;
 RETURN candidate;
END $$;
CREATE FUNCTION public.schedule_subscription_change(p_owner uuid,p_client uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.clients%ROWTYPE; a public.recurring_agreements%ROWTYPE; existing public.subscription_changes%ROWTYPE;
 target jsonb; effective date:=coalesce((p_input->>'effectiveFrom')::date,(p_input->>'anchorDate')::date); starts date; change_id uuid;
BEGIN
 c:=public.lifecycle_client_lock(p_owner,p_client);
 SELECT * INTO a FROM public.recurring_agreements WHERE id=(p_input->>'agreementId')::uuid AND owner_id=p_owner AND client_id=p_client FOR UPDATE;
 IF NOT FOUND OR a.status NOT IN ('active','paused','pending') OR a.provider<>'manual' OR NOT a.installments_enabled OR c.archived_at IS NOT NULL OR a.cancel_at_period_end THEN RAISE EXCEPTION 'PAYMENT_AGREEMENT_DENIED'; END IF;
 IF effective IS NULL OR effective<(now() AT TIME ZONE 'UTC')::date OR effective>(now() AT TIME ZONE 'UTC')::date+180 THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 SELECT * INTO existing FROM public.subscription_changes WHERE recurring_agreement_id=a.id AND status='scheduled' FOR UPDATE;
 IF existing.id IS NOT NULL THEN
  IF p_input->>'replaceChangeId' IS DISTINCT FROM existing.id::text THEN RAISE EXCEPTION 'SUBSCRIPTION_CHANGE_EXISTS'; END IF;
  UPDATE public.subscription_changes SET status='cancelled',cancelled_at=now() WHERE id=existing.id;
 ELSIF p_input->>'replaceChangeId' IS NOT NULL THEN RAISE EXCEPTION 'SUBSCRIPTION_CHANGE_UNAVAILABLE'; END IF;
 IF p_input->>'planId' IS NOT NULL THEN target:=public.resolve_plan(p_owner,(p_input->>'planId')::uuid,effective);
 ELSE
  IF p_input->>'frequency' IS NULL OR p_input->>'frequency' NOT IN ('weekly','biweekly','monthly') OR coalesce((p_input->>'amount')::numeric,0)<=0 OR (p_input->>'amount')::numeric>1e12 OR (p_input->>'amount')::numeric<>round((p_input->>'amount')::numeric,2) OR length(p_input->>'planName')>200 THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
  target:=jsonb_build_object('planName',coalesce(nullif(trim(p_input->>'planName'),''),'Personalizado'),'amount',(p_input->>'amount')::numeric,'frequency',p_input->>'frequency');
 END IF;
 starts:=public.subscription_change_start(a.id,effective);
 INSERT INTO public.subscription_changes(owner_id,client_id,recurring_agreement_id,source_plan_id,target_plan_id,new_plan_name,new_amount,currency,new_frequency,effective_from,starts_on,price_id)
 VALUES(p_owner,p_client,a.id,a.plan_id,(target->>'planId')::uuid,target->>'planName',(target->>'amount')::numeric,a.currency,target->>'frequency',effective,starts,(p_input->>'batchPriceId')::uuid) RETURNING id INTO change_id;
 RETURN jsonb_build_object('ok',true,'changeId',change_id,'startsOn',starts,'effectiveFrom',effective,'delayed',starts>effective);
END $$;
CREATE FUNCTION public.plan_catalog_operation(p_owner uuid,p_action text,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p public.plans%ROWTYPE; price public.plan_prices%ROWTYPE; a public.recurring_agreements%ROWTYPE; currency text;
 effective date:=(p_input->>'effectiveFrom')::date; scheduled integer:=0; skipped integer:=0; result jsonb;
BEGIN
 SELECT default_currency INTO currency FROM public.owners WHERE id=p_owner AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_OWNER_DENIED'; END IF;
 IF p_action='create' THEN
  INSERT INTO public.plans(owner_id,name,frequency) VALUES(p_owner,trim(p_input->>'name'),p_input->>'frequency') RETURNING * INTO p;
 ELSE
  SELECT * INTO p FROM public.plans WHERE id=(p_input->>'planId')::uuid AND owner_id=p_owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_UNAVAILABLE'; END IF;
 END IF;
 IF p_action='archive' THEN UPDATE public.plans SET archived_at=coalesce(archived_at,now()) WHERE id=p.id;RETURN jsonb_build_object('ok',true); END IF;
 IF p.archived_at IS NOT NULL THEN RAISE EXCEPTION 'PLAN_UNAVAILABLE'; END IF;
 IF p_action='edit' THEN
  UPDATE public.plans SET name=coalesce(nullif(trim(p_input->>'name'),''),name),frequency=coalesce(p_input->>'frequency',frequency) WHERE id=p.id;
 END IF;
 IF p_action NOT IN ('create','edit','price') THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 IF p_action='create' OR p_input->>'amount' IS NOT NULL THEN
  IF effective IS NULL OR effective<DATE '1900-01-01' OR (p_action<>'create' AND effective<(now() AT TIME ZONE 'UTC')::date) OR (p_input->>'amount')::numeric IS NULL OR (p_input->>'amount')::numeric<=0 OR (p_input->>'amount')::numeric>1e12 OR (p_input->>'amount')::numeric<>round((p_input->>'amount')::numeric,2) THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
  SELECT * INTO price FROM public.plan_prices WHERE plan_id=p.id AND effective_from=effective;
  IF price.id IS NOT NULL THEN
   IF NOT coalesce((p_input->>'applyExisting')::boolean,false) OR price.amount IS DISTINCT FROM (p_input->>'amount')::numeric THEN RAISE EXCEPTION 'PLAN_PRICE_DATE_EXISTS'; END IF;
  ELSE
   INSERT INTO public.plan_prices(owner_id,plan_id,amount,currency,effective_from) VALUES(p_owner,p.id,(p_input->>'amount')::numeric,currency,effective) RETURNING * INTO price;
  END IF;
  IF coalesce((p_input->>'applyExisting')::boolean,false) THEN
   FOR a IN SELECT * FROM public.recurring_agreements WHERE owner_id=p_owner AND plan_id=p.id AND status IN ('active','paused','pending') AND provider='manual' AND installments_enabled ORDER BY client_id,id FOR UPDATE LOOP
    IF a.cancel_at_period_end OR EXISTS(SELECT 1 FROM public.subscription_changes WHERE recurring_agreement_id=a.id AND (status='scheduled' OR price_id=price.id)) OR EXISTS(SELECT 1 FROM public.clients WHERE id=a.client_id AND archived_at IS NOT NULL) THEN skipped:=skipped+1;CONTINUE; END IF;
    result:=public.schedule_subscription_change(p_owner,a.client_id,jsonb_build_object('agreementId',a.id,'planId',p.id,'effectiveFrom',effective,'batchPriceId',price.id));scheduled:=scheduled+1;
   END LOOP;
  END IF;
 END IF;
 RETURN jsonb_build_object('ok',true,'planId',p.id,'scheduled',scheduled,'skipped',skipped);
END $$;
ALTER FUNCTION public.subscription_lifecycle(uuid,uuid,text,jsonb) RENAME TO subscription_lifecycle_v17;
ALTER FUNCTION public.ensure_recurring_installments_through(uuid,uuid,date) RENAME TO ensure_recurring_installments_v17;
CREATE OR REPLACE FUNCTION public.ensure_recurring_installments_through(p_owner uuid,p_client uuid,p_through date) RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.clients%ROWTYPE;a public.recurring_agreements%ROWTYPE;change public.subscription_changes%ROWTYPE;
 boundary date; generated integer:=0;setting_before text;today date:=(now() AT TIME ZONE 'UTC')::date;
BEGIN
 c:=public.lifecycle_client_lock(p_owner,p_client);
 IF p_through IS NULL OR p_through>today+180 THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 SELECT * INTO a FROM public.recurring_agreements WHERE owner_id=p_owner AND client_id=p_client AND status IN ('active','paused','pending') FOR UPDATE;
 IF NOT FOUND OR c.archived_at IS NOT NULL THEN RETURN 0; END IF;
 IF a.cancel_at_period_end THEN
  IF today>a.cancellation_boundary THEN
   PERFORM public.subscription_lifecycle_v17(p_owner,p_client,'cancel',jsonb_build_object('agreementId',a.id));
   UPDATE public.recurring_agreements SET cancel_at_period_end=false,cancellation_boundary=NULL WHERE id=a.id;
   RETURN 0;
  END IF;
  p_through:=least(p_through,a.cancellation_boundary);
 END IF;
 IF a.status<>'active' OR NOT a.installments_enabled THEN RETURN 0; END IF;
 SELECT * INTO change FROM public.subscription_changes WHERE recurring_agreement_id=a.id AND status='scheduled' FOR UPDATE;
 IF change.id IS NOT NULL THEN
  boundary:=public.subscription_change_start(a.id,change.effective_from);
  UPDATE public.subscription_changes SET starts_on=boundary WHERE id=change.id;
  IF (now() AT TIME ZONE 'UTC')::date<change.effective_from THEN
   -- Do not activate a future change merely by navigating a future calendar.
   p_through:=least(p_through,boundary-1);
  ELSIF p_through>=boundary THEN
   generated:=public.ensure_recurring_installments_v17(p_owner,p_client,boundary-1);
   -- Only unallocated future obligations are replaceable. All earlier snapshots survive.
   UPDATE public.recurring_installments i SET status='cancelled',cancelled_at=now()
    WHERE recurring_agreement_id=a.id AND due_date>=boundary AND due_date>today AND status='open' AND public.installment_coverage(i.id)=0;
   setting_before:=current_setting('isipici.edit_plan',true);PERFORM set_config('isipici.edit_plan',a.id::text,true);
   UPDATE public.recurring_agreements SET plan_id=change.target_plan_id,plan_name=change.new_plan_name,amount=change.new_amount,
    interval_unit=CASE WHEN change.new_frequency='monthly' THEN 'month' ELSE 'week' END,interval_count=CASE WHEN change.new_frequency='biweekly' THEN 2 ELSE 1 END,
    billing_anchor_date=boundary,next_charge_at=boundary::timestamp AT TIME ZONE 'UTC' WHERE id=a.id;
   PERFORM set_config('isipici.edit_plan',coalesce(setting_before,''),true);
   UPDATE public.subscription_changes SET status='applied',applied_at=now() WHERE id=change.id;
  END IF;
 END IF;
 RETURN generated+public.ensure_recurring_installments_v17(p_owner,p_client,p_through);
END $$;
CREATE OR REPLACE FUNCTION public.subscription_lifecycle(p_owner uuid,p_client uuid,p_action text,p_input jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.clients%ROWTYPE;a public.recurring_agreements%ROWTYPE;result jsonb;target jsonb;boundary date;setting_before text;
BEGIN
 c:=public.lifecycle_client_lock(p_owner,p_client);
 IF p_action='change' THEN RETURN public.schedule_subscription_change(p_owner,p_client,p_input); END IF;
 IF p_action IN ('cancel_change','cancel_end','undo_cancel_end') THEN
  SELECT * INTO a FROM public.recurring_agreements WHERE id=(p_input->>'agreementId')::uuid AND owner_id=p_owner AND client_id=p_client FOR UPDATE;
  IF NOT FOUND OR a.status NOT IN ('active','paused','pending') OR a.provider<>'manual' OR c.archived_at IS NOT NULL THEN RAISE EXCEPTION 'PAYMENT_AGREEMENT_DENIED'; END IF;
  IF p_action='cancel_change' THEN
   UPDATE public.subscription_changes SET status='cancelled',cancelled_at=now() WHERE id=(p_input->>'changeId')::uuid AND owner_id=p_owner AND client_id=p_client AND recurring_agreement_id=a.id AND status='scheduled';
   IF NOT FOUND THEN RAISE EXCEPTION 'SUBSCRIPTION_CHANGE_UNAVAILABLE'; END IF;
  ELSIF p_action='cancel_end' THEN
   IF a.status<>'active' OR NOT a.installments_enabled THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_CONFLICT'; END IF;
   SELECT max(period_to) INTO boundary FROM public.recurring_installments i WHERE recurring_agreement_id=a.id AND status<>'cancelled'
    AND (period_from<=(now() AT TIME ZONE 'UTC')::date OR public.installment_coverage(id)>0);
   IF boundary IS NULL OR boundary<(now() AT TIME ZONE 'UTC')::date THEN boundary:=(now() AT TIME ZONE 'UTC')::date; END IF;
   UPDATE public.recurring_agreements SET cancel_at_period_end=true,cancellation_boundary=boundary WHERE id=a.id;
   UPDATE public.subscription_changes SET status='cancelled',cancelled_at=now() WHERE recurring_agreement_id=a.id AND status='scheduled';
   UPDATE public.recurring_installments i SET status='cancelled',cancelled_at=now() WHERE recurring_agreement_id=a.id AND status='open' AND due_date>boundary AND public.installment_coverage(id)=0;
  ELSE
   IF NOT a.cancel_at_period_end OR (now() AT TIME ZONE 'UTC')::date>a.cancellation_boundary THEN RAISE EXCEPTION 'SUBSCRIPTION_TERMINAL'; END IF;
   UPDATE public.recurring_agreements SET cancel_at_period_end=false,cancellation_boundary=NULL,next_charge_at=least(next_charge_at,(cancellation_boundary+1)::timestamp AT TIME ZONE 'UTC') WHERE id=a.id;
  END IF;
  PERFORM public.refresh_installment_snapshot(p_owner,p_client);RETURN jsonb_build_object('ok',true);
 END IF;
 IF p_action='create' AND p_input->>'planId' IS NOT NULL THEN
  target:=public.resolve_plan(p_owner,(p_input->>'planId')::uuid,(p_input->>'anchorDate')::date);
  p_input:=p_input||target;
 END IF;
 result:=public.subscription_lifecycle_v17(p_owner,p_client,p_action,p_input);
 IF p_action='create' THEN
  setting_before:=current_setting('isipici.edit_plan',true);PERFORM set_config('isipici.edit_plan',result->>'agreementId',true);
  UPDATE public.recurring_agreements SET plan_id=(p_input->>'planId')::uuid,plan_name=coalesce(nullif(trim(p_input->>'planName'),''),'Personalizado') WHERE id=(result->>'agreementId')::uuid AND owner_id=p_owner AND client_id=p_client;
  PERFORM set_config('isipici.edit_plan',coalesce(setting_before,''),true);
 ELSIF p_action IN ('cancel','archive') THEN
  UPDATE public.subscription_changes SET status='cancelled',cancelled_at=now() WHERE owner_id=p_owner AND client_id=p_client AND status='scheduled';
  UPDATE public.recurring_agreements SET cancel_at_period_end=false,cancellation_boundary=NULL WHERE owner_id=p_owner AND client_id=p_client AND cancel_at_period_end;
 ELSIF p_action='resume' THEN
  PERFORM public.ensure_recurring_installments_through(p_owner,p_client,(p_input->>'nextDueDate')::date);
 END IF;
 RETURN result;
END $$;
-- The former immediate editing RPC now schedules, retaining compatibility with old callers.
CREATE OR REPLACE FUNCTION public.edit_recurring_plan(p_owner uuid,p_client uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RETURN public.schedule_subscription_change(p_owner,p_client,p_input);END $$;
CREATE FUNCTION public.guard_agreement_plan() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.plan_id IS DISTINCT FROM OLD.plan_id AND current_setting('isipici.edit_plan',true) IS DISTINCT FROM OLD.id::text THEN RAISE EXCEPTION 'SUBSCRIPTION_CONFIG_IMMUTABLE'; END IF;
 IF NEW.plan_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.plan_id IS DISTINCT FROM OLD.plan_id) THEN
  PERFORM 1 FROM public.plans WHERE id=NEW.plan_id AND owner_id=NEW.owner_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_UNAVAILABLE'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER agreement_plan_guard BEFORE INSERT OR UPDATE ON public.recurring_agreements FOR EACH ROW EXECUTE FUNCTION public.guard_agreement_plan();
CREATE FUNCTION public.guard_subscription_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.recurring_agreements%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SUBSCRIPTION_CHANGE_HISTORY_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status<>'scheduled' OR NEW.owner_id<>OLD.owner_id OR NEW.client_id<>OLD.client_id OR NEW.recurring_agreement_id<>OLD.recurring_agreement_id OR NEW.target_plan_id IS DISTINCT FROM OLD.target_plan_id OR NEW.source_plan_id IS DISTINCT FROM OLD.source_plan_id OR NEW.new_amount<>OLD.new_amount OR NEW.currency<>OLD.currency OR NEW.new_frequency<>OLD.new_frequency OR NEW.new_plan_name IS DISTINCT FROM OLD.new_plan_name OR NEW.effective_from<>OLD.effective_from OR NEW.price_id IS DISTINCT FROM OLD.price_id THEN RAISE EXCEPTION 'SUBSCRIPTION_CHANGE_HISTORY_IMMUTABLE'; END IF;
 END IF;
 SELECT * INTO a FROM public.recurring_agreements WHERE id=NEW.recurring_agreement_id AND owner_id=NEW.owner_id AND client_id=NEW.client_id FOR UPDATE;
 IF NOT FOUND OR a.currency<>NEW.currency THEN RAISE EXCEPTION 'PAYMENT_CURRENCY_CONFLICT'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER subscription_change_guard BEFORE INSERT OR UPDATE OR DELETE ON public.subscription_changes FOR EACH ROW EXECUTE FUNCTION public.guard_subscription_change();
REVOKE ALL ON FUNCTION public.guard_subscription_change() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_subscription_change() TO service_role;
REVOKE ALL ON FUNCTION public.guard_plan_catalog(),public.guard_plan_price(),public.resolve_plan(uuid,uuid,date),public.subscription_change_start(uuid,date),public.schedule_subscription_change(uuid,uuid,jsonb),public.plan_catalog_operation(uuid,text,jsonb),public.guard_agreement_plan() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_plan_catalog(),public.guard_plan_price(),public.resolve_plan(uuid,uuid,date),public.subscription_change_start(uuid,date),public.schedule_subscription_change(uuid,uuid,jsonb),public.plan_catalog_operation(uuid,text,jsonb),public.guard_agreement_plan() TO service_role;
REVOKE ALL ON FUNCTION public.subscription_lifecycle(uuid,uuid,text,jsonb),public.ensure_recurring_installments_through(uuid,uuid,date),public.edit_recurring_plan(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_lifecycle(uuid,uuid,text,jsonb),public.ensure_recurring_installments_through(uuid,uuid,date),public.edit_recurring_plan(uuid,uuid,jsonb) TO service_role;
CREATE FUNCTION public.list_plan_catalog(p_owner uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.owners WHERE id=p_owner AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_OWNER_DENIED'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'frequency',p.frequency,'archived_at',p.archived_at,
 'prices',coalesce((SELECT jsonb_agg(jsonb_build_object('id',price.id,'plan_id',price.plan_id,'amount',price.amount,'currency',price.currency,'effective_from',price.effective_from) ORDER BY price.effective_from) FROM public.plan_prices price WHERE price.plan_id=p.id AND price.owner_id=p_owner),'[]'::jsonb),
 'subscriptions',(SELECT count(*) FROM public.recurring_agreements a WHERE a.plan_id=p.id AND a.owner_id=p_owner AND a.status IN ('active','paused','pending')),
 'used',EXISTS(SELECT 1 FROM public.recurring_agreements a WHERE a.plan_id=p.id AND a.owner_id=p_owner) OR EXISTS(SELECT 1 FROM public.subscription_changes ch WHERE ch.owner_id=p_owner AND (ch.source_plan_id=p.id OR ch.target_plan_id=p.id))) ORDER BY p.name,p.id)
 FROM public.plans p WHERE p.owner_id=p_owner AND p.archived_at IS NULL),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.list_plan_catalog(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_plan_catalog(uuid) TO service_role;
ALTER FUNCTION public.register_canonical_payment(uuid,jsonb) RENAME TO register_canonical_payment_v17;
CREATE FUNCTION public.register_canonical_payment(p_owner_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result jsonb;installment uuid;c public.clients%ROWTYPE;
BEGIN
 c:=public.lifecycle_client_lock(p_owner_id,(p_input->>'clientId')::uuid);
 IF p_input->>'planId' IS NOT NULL OR (p_input->>'provider'='manual' AND p_input->>'frequency' IS NOT NULL AND p_input->>'recurringAgreementId' IS NULL AND p_input->>'recurringInstallmentId' IS NULL AND coalesce(jsonb_array_length(p_input->'selectedInstallmentIds'),0)=0) THEN
  IF p_input->>'paymentType'<>'recurring' OR p_input->>'provider'<>'manual' OR p_input->>'recurringInstallmentId' IS NOT NULL OR coalesce(jsonb_array_length(p_input->'selectedInstallmentIds'),0)>0 OR p_input->>'recurringAgreementId' IS NOT NULL OR p_input->>'debtPaymentId' IS NOT NULL THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
  result:=public.subscription_lifecycle(p_owner_id,(p_input->>'clientId')::uuid,'create',jsonb_build_object('planId',p_input->>'planId','anchorDate',p_input->>'anchorDate','frequency',p_input->>'frequency','amount',coalesce((p_input->>'amount')::numeric,0)+coalesce((p_input->>'discount')::numeric,0)+coalesce((p_input->>'debt')::numeric,0),'planName',p_input->>'plan'));
  SELECT id INTO installment FROM public.recurring_installments WHERE recurring_agreement_id=(result->>'agreementId')::uuid ORDER BY due_date LIMIT 1;
  p_input:=(p_input-'planId'-'frequency'-'anchorDate'-'cycleDate'-'periodFrom'-'periodTo'-'serviceDate')||jsonb_build_object('recurringAgreementId',result->>'agreementId','recurringInstallmentId',installment);
 END IF;
 RETURN public.register_canonical_payment_v17(p_owner_id,p_input);
END $$;
REVOKE ALL ON FUNCTION public.register_canonical_payment(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_canonical_payment(uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
