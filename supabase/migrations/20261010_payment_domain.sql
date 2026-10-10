-- Hito 5. Aplicación MANUAL. Requiere ids UUID, campos legacy auditados y owners.is_active.
BEGIN;

ALTER TABLE public.clients ADD COLUMN currency text NOT NULL DEFAULT 'ARS'
  CHECK (currency IN ('ARS', 'AUD'));

CREATE TABLE public.payment_provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('manual','stripe','mercadopago')),
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','pending','connected','restricted')),
  country_code text CHECK (country_code ~ '^[A-Z]{2}$'),
  default_currency text NOT NULL CHECK (default_currency IN ('ARS','AUD')),
  provider_account_id text CHECK (length(provider_account_id) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, provider), UNIQUE (id, owner_id, provider, default_currency)
);
CREATE UNIQUE INDEX payment_provider_external_account_unique
  ON public.payment_provider_accounts(provider, provider_account_id) WHERE provider_account_id IS NOT NULL;

CREATE TABLE public.recurring_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  payment_provider_account_id uuid,
  provider text NOT NULL CHECK (provider IN ('manual','stripe','mercadopago')),
  provider_customer_id text CHECK (length(provider_customer_id) BETWEEN 1 AND 200),
  provider_agreement_id text CHECK (length(provider_agreement_id) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','cancelled','failed')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency IN ('ARS','AUD')),
  interval_unit text NOT NULL CHECK (interval_unit IN ('day','week','month','year')),
  interval_count integer NOT NULL DEFAULT 1 CHECK (interval_count BETWEEN 1 AND 120),
  next_charge_at timestamptz, started_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (provider = 'manual' OR payment_provider_account_id IS NOT NULL),
  UNIQUE (id, owner_id, client_id, provider, currency),
  FOREIGN KEY (payment_provider_account_id, owner_id, provider, currency)
    REFERENCES public.payment_provider_accounts(id, owner_id, provider, default_currency)
);
CREATE INDEX recurring_agreements_owner_client_idx ON public.recurring_agreements(owner_id, client_id);
CREATE UNIQUE INDEX recurring_agreements_provider_unique
  ON public.recurring_agreements(provider, provider_agreement_id) WHERE provider_agreement_id IS NOT NULL;

-- No inventar concepto, fecha del servicio ni tipo en pagos históricos.
ALTER TABLE public.payments
  ADD COLUMN provider text NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual','stripe','mercadopago')),
  ADD COLUMN currency text NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS','AUD')),
  ADD COLUMN payment_type text CHECK (payment_type IN ('recurring','one_off')),
  ADD COLUMN concept text CHECK (length(concept) BETWEEN 1 AND 200),
  ADD COLUMN service_date date,
  ADD COLUMN receipt_note text CHECK (length(receipt_note) BETWEEN 1 AND 1000),
  ADD COLUMN provider_payment_id text CHECK (length(provider_payment_id) BETWEEN 1 AND 200),
  ADD COLUMN recurring_agreement_id uuid,
  ADD COLUMN payment_provider_account_id uuid,
  ADD CONSTRAINT payments_one_off_context_check CHECK (payment_type IS DISTINCT FROM 'one_off' OR
    (recurring_agreement_id IS NULL AND period_from IS NULL AND period_to IS NULL AND next_payment_date IS NULL)),
  ADD CONSTRAINT payments_provider_context_check CHECK (
    (provider = 'manual' AND provider_payment_id IS NULL AND payment_provider_account_id IS NULL) OR
    (provider <> 'manual' AND provider_payment_id IS NOT NULL AND payment_provider_account_id IS NOT NULL)),
  ADD CONSTRAINT payments_agreement_context_fk FOREIGN KEY (recurring_agreement_id, owner_id, client_id, provider, currency)
    REFERENCES public.recurring_agreements(id, owner_id, client_id, provider, currency),
  ADD CONSTRAINT payments_account_context_fk FOREIGN KEY (payment_provider_account_id, owner_id, provider, currency)
    REFERENCES public.payment_provider_accounts(id, owner_id, provider, default_currency);
CREATE UNIQUE INDEX payments_provider_payment_unique ON public.payments(provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
CREATE INDEX payments_owner_currency_created_idx ON public.payments(owner_id, currency, created_at);

CREATE FUNCTION public.payment_domain_updated_at() RETURNS trigger LANGUAGE plpgsql
SET search_path = '' AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
CREATE TRIGGER payment_accounts_updated_at BEFORE UPDATE ON public.payment_provider_accounts
  FOR EACH ROW EXECUTE FUNCTION public.payment_domain_updated_at();
CREATE TRIGGER recurring_agreements_updated_at BEFORE UPDATE ON public.recurring_agreements
  FOR EACH ROW EXECUTE FUNCTION public.payment_domain_updated_at();

-- También protege escrituras de acuerdos hechas por futuros servicios con service_role.
CREATE FUNCTION public.check_recurring_agreement_owner() RETURNS trigger LANGUAGE plpgsql
SET search_path = '' AS $$
DECLARE client_row jsonb;
BEGIN
  SELECT to_jsonb(c) INTO client_row FROM public.clients c WHERE c.id = NEW.client_id FOR SHARE;
  IF coalesce(client_row->>'owner_id', client_row->>'gym_id') IS DISTINCT FROM NEW.owner_id::text THEN
    RAISE EXCEPTION 'PAYMENT_AGREEMENT_DENIED';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER recurring_agreements_owner_guard BEFORE INSERT OR UPDATE ON public.recurring_agreements
  FOR EACH ROW EXECUTE FUNCTION public.check_recurring_agreement_owner();

ALTER TABLE public.payment_provider_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_agreements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_provider_accounts, public.recurring_agreements FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payment_provider_accounts, public.recurring_agreements TO service_role;

-- Inserción y snapshot en una misma transacción. No hay llamadas a proveedores ni email aquí.
CREATE FUNCTION public.register_canonical_payment(p_owner_id uuid, p_input jsonb) RETURNS jsonb
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
BEGIN
  IF provider IS NULL OR provider NOT IN ('manual','stripe','mercadopago') OR
    payment_type IS NULL OR payment_type NOT IN ('recurring','one_off') OR
    currency IS NULL OR currency NOT IN ('ARS','AUD') OR amount IS NULL OR amount < 0 OR
    amount > 1e12 OR amount <> round(amount,2) OR discount < 0 OR discount > 1e12 OR discount <> round(discount,2)
    THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
  PERFORM 1 FROM public.owners WHERE id = p_owner_id AND is_active = true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_OWNER_DENIED'; END IF;
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
  IF client_row.currency <> currency AND (coalesce(client_row.current_debt,0) <> 0 OR
    EXISTS (SELECT 1 FROM public.payments WHERE payments.client_id = client_id))
    THEN RAISE EXCEPTION 'PAYMENT_CURRENCY_CONFLICT'; END IF;
  debt := coalesce((p_input->>'debt')::numeric,
    (SELECT payments.debt FROM public.payments WHERE payments.client_id = client_id AND owner_id = p_owner_id
      ORDER BY created_at DESC, id DESC LIMIT 1), client_row.current_debt,0);
  IF debt < 0 OR debt > 1e12 OR debt <> round(debt,2) THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
  INSERT INTO public.payments(owner_id, client_id, amount, plan, discount, debt, period_from, period_to, next_payment_date,
    provider, currency, payment_type, concept, service_date, receipt_note, provider_payment_id, recurring_agreement_id, payment_provider_account_id)
  VALUES (p_owner_id, client_id, amount, coalesce(p_input->>'plan', p_input->>'concept'), discount, debt,
    (p_input->>'periodFrom')::date, (p_input->>'periodTo')::date, (p_input->>'periodTo')::date,
    provider, currency, payment_type, p_input->>'concept', (p_input->>'serviceDate')::date, p_input->>'receiptNote', external_id, agreement_id, account_id)
  RETURNING * INTO saved;
  UPDATE public.clients SET current_debt = debt, last_payment_amount = amount,
    last_payment_date = (saved.created_at AT TIME ZONE 'UTC')::date,
    next_payment_date = CASE WHEN payment_type = 'recurring' THEN (p_input->>'periodTo')::date ELSE client_row.next_payment_date END,
    currency = currency WHERE id = client_id;
  RETURN jsonb_build_object('payment', to_jsonb(saved), 'duplicate', false);
END; $$;

REVOKE ALL ON FUNCTION public.register_canonical_payment(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_canonical_payment(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.check_recurring_agreement_owner(), public.payment_domain_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_recurring_agreement_owner(), public.payment_domain_updated_at() TO service_role;
COMMIT;
