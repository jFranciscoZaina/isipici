-- Requiere las tablas existentes email_logs, owners y clients.
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_email_id text,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS deduplication_key text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS complained_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_delayed_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_details jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- Pendiente antes de la aceptación del proveedor; nunca inventar un envío.
ALTER TABLE public.email_logs ALTER COLUMN sent_at DROP NOT NULL;
CREATE UNIQUE INDEX email_logs_provider_identity ON public.email_logs(provider, provider_email_id) WHERE provider_email_id IS NOT NULL;
CREATE UNIQUE INDEX email_logs_deduplication_key ON public.email_logs(deduplication_key) WHERE deduplication_key IS NOT NULL;

CREATE TABLE public.email_events (
  event_id text PRIMARY KEY,
  provider_email_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.opened','email.clicked')),
  occurred_at timestamptz NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_events_provider_identity ON public.email_events(provider_email_id);
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.email_events TO service_role;

-- Recalcular desde hechos persistidos evita retroceder por eventos fuera de orden.
CREATE FUNCTION public.reconcile_resend_email(p_email_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE affected integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('resend:' || p_email_id, 0));
  UPDATE public.email_logs AS log SET
    delivery_status = state.status,
    status = CASE WHEN state.status IN ('failed', 'bounced', 'complained') THEN 'failed' ELSE 'sent' END,
    sent_at = COALESCE(LEAST(log.sent_at, state.sent_at), log.sent_at),
    delivered_at = state.delivered_at, opened_at = state.opened_at,
    clicked_at = state.clicked_at, bounced_at = state.bounced_at,
    failed_at = state.failed_at, complained_at = state.complained_at,
    delivery_delayed_at = state.delivery_delayed_at,
    error_details = COALESCE(state.details, log.error_details), updated_at = now()
  FROM (
    SELECT
      CASE WHEN bool_or(type = 'email.complained') THEN 'complained'
           WHEN bool_or(type = 'email.bounced') THEN 'bounced'
           WHEN bool_or(type = 'email.failed') THEN 'failed'
           WHEN bool_or(type = 'email.clicked') THEN 'clicked'
           WHEN bool_or(type = 'email.opened') THEN 'opened'
           WHEN bool_or(type = 'email.delivered') THEN 'delivered'
           WHEN bool_or(type = 'email.delivery_delayed') THEN 'delivery_delayed'
           ELSE 'sent' END AS status,
      min(occurred_at) FILTER (WHERE type = 'email.sent') AS sent_at,
      min(occurred_at) FILTER (WHERE type = 'email.delivered') AS delivered_at,
      min(occurred_at) FILTER (WHERE type = 'email.opened') AS opened_at,
      min(occurred_at) FILTER (WHERE type = 'email.clicked') AS clicked_at,
      min(occurred_at) FILTER (WHERE type = 'email.bounced') AS bounced_at,
      min(occurred_at) FILTER (WHERE type = 'email.failed') AS failed_at,
      min(occurred_at) FILTER (WHERE type = 'email.complained') AS complained_at,
      min(occurred_at) FILTER (WHERE type = 'email.delivery_delayed') AS delivery_delayed_at,
      (array_agg(details ORDER BY occurred_at DESC) FILTER (WHERE details IS NOT NULL))[1] AS details
    FROM public.email_events WHERE provider_email_id = p_email_id
    HAVING count(*) > 0
  ) state WHERE log.provider = 'resend' AND log.provider_email_id = p_email_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

CREATE FUNCTION public.record_resend_event(p_event_id text, p_email_id text, p_type text, p_occurred_at timestamptz, p_details jsonb DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE affected integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('resend:' || p_email_id, 0));
  INSERT INTO public.email_events(event_id, provider_email_id, type, occurred_at, details)
  VALUES (p_event_id, p_email_id, p_type, p_occurred_at, p_details)
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM public.reconcile_resend_email(p_email_id);
  RETURN affected > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_resend_email(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_resend_event(text,text,text,timestamptz,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_resend_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_resend_event(text,text,text,timestamptz,jsonb) TO service_role;
