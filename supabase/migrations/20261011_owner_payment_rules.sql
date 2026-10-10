-- Refinamiento del hito 5. Aplicar MANUALMENTE después de 20261010_payment_domain.sql.
BEGIN;
-- Detenerse ante monedas mezcladas: requieren conciliación manual, nunca conversión automática.
DO $$ BEGIN
  IF EXISTS (SELECT owner_id FROM public.payments GROUP BY owner_id HAVING count(DISTINCT currency) > 1) THEN
    RAISE EXCEPTION 'OWNER_MIXED_CURRENCIES_REVIEW_REQUIRED';
  END IF;
END; $$;
ALTER TABLE public.owners ADD COLUMN default_currency text NOT NULL DEFAULT 'ARS'
  CHECK (default_currency IN ('ARS','AUD'));
-- Conservar cuentas AUD inequívocas que pudieron usar la versión anterior del hito.
UPDATE public.owners o SET default_currency = 'AUD'
  WHERE EXISTS (SELECT 1 FROM public.payments p WHERE p.owner_id=o.id AND p.currency='AUD');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.payment_provider_accounts a JOIN public.owners o ON o.id=a.owner_id WHERE a.default_currency<>o.default_currency)
    OR EXISTS (SELECT 1 FROM public.recurring_agreements a JOIN public.owners o ON o.id=a.owner_id WHERE a.currency<>o.default_currency)
    OR EXISTS (SELECT 1 FROM public.clients c JOIN public.owners o ON o.id=coalesce(to_jsonb(c)->>'owner_id',to_jsonb(c)->>'gym_id')::uuid WHERE coalesce(c.current_debt,0)<>0 AND c.currency<>o.default_currency)
  THEN RAISE EXCEPTION 'OWNER_CURRENCY_CONFIGURATION_REVIEW_REQUIRED'; END IF;
END; $$;
CREATE FUNCTION public.guard_owner_currency() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.default_currency IS DISTINCT FROM OLD.default_currency AND (
    EXISTS (SELECT 1 FROM public.payments WHERE owner_id=OLD.id) OR
    EXISTS (SELECT 1 FROM public.payment_provider_accounts WHERE owner_id=OLD.id) OR
    EXISTS (SELECT 1 FROM public.recurring_agreements WHERE owner_id=OLD.id) OR
    EXISTS (SELECT 1 FROM public.clients c WHERE coalesce(to_jsonb(c)->>'owner_id',to_jsonb(c)->>'gym_id')=OLD.id::text AND coalesce(c.current_debt,0)<>0)
  ) THEN RAISE EXCEPTION 'OWNER_CURRENCY_LOCKED'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER owners_currency_guard BEFORE UPDATE OF default_currency ON public.owners
  FOR EACH ROW EXECUTE FUNCTION public.guard_owner_currency();
CREATE FUNCTION public.guard_payment_currency_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE configured text;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.currency IS DISTINCT FROM OLD.currency THEN RAISE EXCEPTION 'PAYMENT_CURRENCY_IMMUTABLE'; END IF;
  ELSE
    SELECT default_currency INTO configured FROM public.owners WHERE id=NEW.owner_id FOR SHARE;
    IF NEW.currency IS DISTINCT FROM configured THEN RAISE EXCEPTION 'PAYMENT_CURRENCY_CONFLICT'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER payments_currency_snapshot_guard BEFORE INSERT OR UPDATE OF currency ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_payment_currency_snapshot();
CREATE OR REPLACE FUNCTION public.register_canonical_payment(p_owner_id uuid, p_input jsonb) RETURNS jsonb
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
      AND payment_provider_account_id IS NOT DISTINCT FROM account_id FOR SHARE;
    IF NOT FOUND OR payment_type <> 'recurring' THEN RAISE EXCEPTION 'PAYMENT_AGREEMENT_DENIED'; END IF;
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
        saved.period_from IS DISTINCT FROM (p_input->>'periodFrom')::date OR
        saved.period_to IS DISTINCT FROM (p_input->>'periodTo')::date OR
        (p_input->>'debt' IS NOT NULL AND saved.debt <> (p_input->>'debt')::numeric)
        THEN RAISE EXCEPTION 'PAYMENT_ID_CONFLICT'; END IF;
      RETURN jsonb_build_object('payment', to_jsonb(saved), 'duplicate', true);
    END IF;
  END IF;
  IF payment_type = 'one_off' AND coalesce((p_input->>'debt')::numeric,0) <> 0 THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
  debt := CASE WHEN payment_type = 'one_off' THEN 0 ELSE coalesce((p_input->>'debt')::numeric,
    (SELECT payments.debt FROM public.payments WHERE payments.client_id = client_id AND owner_id = p_owner_id
      AND payments.payment_type IS DISTINCT FROM 'one_off' ORDER BY created_at DESC, id DESC LIMIT 1), client_row.current_debt,0) END;
  IF debt < 0 OR debt > 1e12 OR debt <> round(debt,2) THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
  INSERT INTO public.payments(owner_id, client_id, amount, plan, discount, debt, period_from, period_to, next_payment_date,
    provider, currency, payment_type, concept, service_date, receipt_note, provider_payment_id, recurring_agreement_id, payment_provider_account_id)
  VALUES (p_owner_id, client_id, amount, coalesce(p_input->>'plan', p_input->>'concept'), discount, debt,
    (p_input->>'periodFrom')::date, (p_input->>'periodTo')::date, (p_input->>'periodTo')::date,
    provider, currency, payment_type, p_input->>'concept', (p_input->>'serviceDate')::date, p_input->>'receiptNote', external_id, agreement_id, account_id)
  RETURNING * INTO saved;
  IF payment_type = 'recurring' THEN
  UPDATE public.clients SET current_debt = debt, last_payment_amount = amount,
    last_payment_date = (saved.created_at AT TIME ZONE 'UTC')::date,
    next_payment_date = CASE WHEN payment_type = 'recurring' THEN (p_input->>'periodTo')::date ELSE client_row.next_payment_date END,
    currency = currency WHERE id = client_id;
  END IF;
  RETURN jsonb_build_object('payment', to_jsonb(saved), 'duplicate', false);
END; $$;


REVOKE ALL ON FUNCTION public.guard_owner_currency(), public.guard_payment_currency_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_owner_currency(), public.guard_payment_currency_snapshot() TO service_role;
REVOKE ALL ON FUNCTION public.register_canonical_payment(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_canonical_payment(uuid,jsonb) TO service_role;
-- clients.currency queda como columna legacy compatible; ninguna API la usa como configuración.
COMMIT;
