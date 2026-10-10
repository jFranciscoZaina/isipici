-- Apply after migration 16. One-off balances never change recurring client snapshots.
BEGIN;
CREATE OR REPLACE FUNCTION public.register_legacy_payment(p_owner_id uuid, p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  client_row public.clients%ROWTYPE;
  saved public.payments%ROWTYPE;
  agreement public.recurring_agreements%ROWTYPE;
  account public.payment_provider_accounts%ROWTYPE;
  client_id uuid := (p_input->>'clientId')::uuid;
  provider text := p_input->>'provider';
  payment_type text := p_input->>'paymentType';
  currency text := p_input->>'currency';
  external_id text := nullif(p_input->>'providerPaymentId','');
  account_id uuid := (p_input->>'providerAccountId')::uuid;
  agreement_id uuid := (p_input->>'recurringAgreementId')::uuid;
  amount numeric := (p_input->>'amount')::numeric;
  discount numeric := coalesce((p_input->>'discount')::numeric, 0);
  debt numeric;
  owner_currency text;
  frequency text := p_input->>'frequency';
  anchor_date date := (p_input->>'anchorDate')::date;
  cycle_date date := coalesce((p_input->>'cycleDate')::date, anchor_date);
  period_start date := (p_input->>'periodFrom')::date;
  period_end date := (p_input->>'periodTo')::date;
  next_due date;
  next_schedule date;
  interval_unit text;
  interval_count integer;
  debt_payment_id uuid := (p_input->>'debtPaymentId')::uuid;
  debt_payment public.payments%ROWTYPE;
BEGIN
  IF provider IS NULL OR provider NOT IN ('manual','stripe','mercadopago') OR
    payment_type IS NULL OR payment_type NOT IN ('recurring','one_off') OR
    currency IS NULL OR currency NOT IN ('ARS','AUD') OR amount IS NULL OR amount < 0 OR
    amount > 1e12 OR amount <> round(amount,2) OR discount < 0 OR discount > 1e12 OR discount <> round(discount,2)
    THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
  SELECT default_currency INTO owner_currency FROM public.owners WHERE id = p_owner_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_OWNER_DENIED'; END IF;
  IF currency IS DISTINCT FROM owner_currency THEN RAISE EXCEPTION 'PAYMENT_CURRENCY_CONFLICT'; END IF;
  IF external_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(provider || ':' || external_id, 0));
  END IF;
  SELECT * INTO client_row FROM public.clients WHERE id = client_id FOR UPDATE;
  IF NOT FOUND OR coalesce(to_jsonb(client_row)->>'owner_id', to_jsonb(client_row)->>'gym_id') IS DISTINCT FROM p_owner_id::text
    THEN RAISE EXCEPTION 'PAYMENT_OWNER_DENIED'; END IF;
  IF provider <> 'manual' THEN
    SELECT * INTO account FROM public.payment_provider_accounts WHERE id = account_id
      AND owner_id = p_owner_id AND payment_provider_accounts.provider = provider AND default_currency = currency
      AND status = 'connected' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_ACCOUNT_DENIED'; END IF;
  END IF;
  IF agreement_id IS NOT NULL THEN
    SELECT * INTO agreement FROM public.recurring_agreements WHERE id = agreement_id
      AND owner_id = p_owner_id AND recurring_agreements.client_id = client_id
      AND recurring_agreements.provider = provider AND recurring_agreements.currency = currency
      AND payment_provider_account_id IS NOT DISTINCT FROM account_id FOR UPDATE;
    IF NOT FOUND OR payment_type <> 'recurring' THEN RAISE EXCEPTION 'PAYMENT_AGREEMENT_DENIED'; END IF;
  END IF;
  IF (period_start IS NULL) <> (period_end IS NULL) OR period_start > period_end THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
  IF payment_type = 'one_off' THEN
    IF frequency IS NOT NULL OR anchor_date IS NOT NULL OR cycle_date IS NOT NULL OR debt_payment_id IS NOT NULL OR agreement_id IS NOT NULL
      THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
    next_due := NULL;
  ELSIF debt_payment_id IS NOT NULL THEN
    IF provider <> 'manual' OR frequency IS NOT NULL OR anchor_date IS NOT NULL OR cycle_date IS NOT NULL OR agreement_id IS NOT NULL
      THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
    SELECT * INTO debt_payment FROM public.payments p WHERE p.id = debt_payment_id AND p.owner_id=p_owner_id AND p.client_id=client_id
      AND p.currency=currency AND p.payment_type IS DISTINCT FROM 'one_off' AND p.debt>0;
    IF NOT FOUND OR coalesce(client_row.current_debt,0)<=0 OR debt_payment.id IS DISTINCT FROM
      (SELECT p.id FROM public.payments p WHERE p.owner_id=p_owner_id AND p.client_id=client_id AND p.payment_type IS DISTINCT FROM 'one_off' ORDER BY p.created_at DESC,p.id DESC LIMIT 1)
      THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_CONFLICT'; END IF;
    period_start := debt_payment.period_from; period_end := debt_payment.period_to;
    next_due := debt_payment.next_payment_date;
  ELSIF frequency IS NOT NULL THEN
    IF frequency NOT IN ('weekly','biweekly','monthly') OR anchor_date IS NULL OR cycle_date IS NULL
      THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
    interval_unit := CASE WHEN frequency='monthly' THEN 'month' ELSE 'week' END;
    interval_count := CASE WHEN frequency='biweekly' THEN 2 ELSE 1 END;
    IF agreement_id IS NULL THEN
      IF provider <> 'manual' THEN RAISE EXCEPTION 'PAYMENT_AGREEMENT_DENIED'; END IF;
      SELECT * INTO agreement FROM public.recurring_agreements a WHERE a.owner_id=p_owner_id AND a.client_id=client_id
        AND a.provider='manual' AND a.currency=currency AND a.status='active' AND a.billing_anchor_date IS NOT NULL FOR UPDATE;
      IF NOT FOUND THEN
        IF amount+discount+coalesce((p_input->>'debt')::numeric,0)<=0 THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
        INSERT INTO public.recurring_agreements(owner_id,client_id,provider,status,amount,currency,interval_unit,interval_count,billing_anchor_date,started_at)
          VALUES(p_owner_id,client_id,'manual','active',amount+discount+coalesce((p_input->>'debt')::numeric,0),currency,interval_unit,interval_count,anchor_date,now()) RETURNING * INTO agreement;
      END IF;
      agreement_id := agreement.id;
    END IF;
    IF agreement.interval_unit<>interval_unit OR agreement.interval_count<>interval_count
      OR (agreement.billing_anchor_date IS NOT NULL AND agreement.billing_anchor_date<>anchor_date)
      THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_CONFLICT'; END IF;
    -- Inicialización explícita de un acuerdo legacy, sin inventar anchors históricos.
    IF agreement.billing_anchor_date IS NULL THEN
      UPDATE public.recurring_agreements SET billing_anchor_date=anchor_date WHERE id=agreement_id RETURNING * INTO agreement;
    END IF;
    IF cycle_date < anchor_date OR (cycle_date<>anchor_date AND public.payment_next_recurring_date(frequency,anchor_date,cycle_date-1)<>cycle_date)
      THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_CONFLICT'; END IF;
    next_due := public.payment_next_recurring_date(frequency,agreement.billing_anchor_date,cycle_date);
    IF (period_start IS NOT NULL AND (period_start<>cycle_date OR period_end<>next_due-1)) OR
       (p_input->>'nextPaymentDate' IS NOT NULL AND (p_input->>'nextPaymentDate')::date<>next_due)
      THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_CONFLICT'; END IF;
    period_start := cycle_date; period_end := next_due-1;
  ELSE
    IF anchor_date IS NOT NULL OR cycle_date IS NOT NULL OR agreement.billing_anchor_date IS NOT NULL THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_CONFLICT'; END IF;
    -- Compatibilidad de callers legacy: no reinterpretar automáticamente sus períodos.
    next_due := period_end;
  END IF;
  IF external_id IS NOT NULL THEN
    SELECT * INTO saved FROM public.payments WHERE payments.provider = provider AND provider_payment_id = external_id;
    IF FOUND THEN
      IF saved.owner_id <> p_owner_id OR saved.client_id <> client_id OR saved.amount <> amount OR
        saved.currency <> currency OR saved.payment_type IS DISTINCT FROM payment_type OR
        saved.payment_provider_account_id IS DISTINCT FROM account_id OR saved.recurring_agreement_id IS DISTINCT FROM agreement_id OR
        saved.concept IS DISTINCT FROM (p_input->>'concept') OR saved.receipt_note IS DISTINCT FROM (p_input->>'receiptNote') OR
        saved.service_date IS DISTINCT FROM (p_input->>'serviceDate')::date OR saved.discount <> discount OR
        saved.plan IS DISTINCT FROM coalesce(p_input->>'plan',p_input->>'concept') OR
        saved.period_from IS DISTINCT FROM period_start OR
        saved.period_to IS DISTINCT FROM period_end OR
        saved.next_payment_date IS DISTINCT FROM next_due OR
        (p_input->>'debt' IS NOT NULL AND saved.debt <> (p_input->>'debt')::numeric)
        THEN RAISE EXCEPTION 'PAYMENT_ID_CONFLICT'; END IF;
      RETURN jsonb_build_object('payment', to_jsonb(saved), 'duplicate', true);
    END IF;
  END IF;
  IF frequency IS NOT NULL AND agreement.status NOT IN ('pending','active') THEN RAISE EXCEPTION 'PAYMENT_SCHEDULE_CONFLICT'; END IF;
  debt := CASE WHEN payment_type = 'one_off' THEN coalesce((p_input->>'debt')::numeric,0) ELSE coalesce((p_input->>'debt')::numeric,
    (SELECT payments.debt FROM public.payments WHERE payments.client_id = client_id AND owner_id = p_owner_id
      AND payments.payment_type IS DISTINCT FROM 'one_off' ORDER BY created_at DESC, id DESC LIMIT 1), client_row.current_debt,0) END;
  IF debt < 0 OR debt > 1e12 OR debt <> round(debt,2) THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
  INSERT INTO public.payments(owner_id, client_id, amount, plan, discount, debt, period_from, period_to, next_payment_date,
    provider, currency, payment_type, concept, service_date, receipt_note, provider_payment_id, recurring_agreement_id, payment_provider_account_id)
  VALUES (p_owner_id, client_id, amount, coalesce(p_input->>'plan', p_input->>'concept'), discount, debt,
    period_start, period_end, next_due,
    provider, currency, payment_type, p_input->>'concept', (p_input->>'serviceDate')::date, p_input->>'receiptNote', external_id, agreement_id, account_id)
  RETURNING * INTO saved;
  IF payment_type = 'recurring' THEN
    IF frequency IS NOT NULL THEN
      -- Un evento atrasado no retrocede la agenda ya confirmada. El pago conserva su propio próximo ciclo.
      next_schedule := greatest(next_due,(agreement.next_charge_at AT TIME ZONE 'UTC')::date);
      UPDATE public.recurring_agreements SET next_charge_at=next_schedule::timestamp AT TIME ZONE 'UTC',status='active' WHERE id=agreement_id;
    ELSE next_schedule := next_due; END IF;
  UPDATE public.clients SET current_debt = debt, last_payment_amount = amount,
    last_payment_date = (saved.created_at AT TIME ZONE 'UTC')::date,
    next_payment_date = CASE WHEN debt_payment_id IS NOT NULL THEN client_row.next_payment_date ELSE next_schedule END,
    currency = currency WHERE id = client_id;
  END IF;
  RETURN jsonb_build_object('payment', to_jsonb(saved), 'duplicate', false);
END; $$;
REVOKE ALL ON FUNCTION public.register_legacy_payment(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_legacy_payment(uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
