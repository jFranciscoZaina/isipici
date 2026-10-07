-- Un límite global persistente para el único operador MVP, incluso en serverless.
CREATE TABLE public.admin_login_limit (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL
);
ALTER TABLE public.admin_login_limit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_login_limit FROM anon, authenticated;
GRANT ALL ON public.admin_login_limit TO service_role;

CREATE FUNCTION public.consume_admin_login_attempt() RETURNS boolean
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  INSERT INTO public.admin_login_limit AS limits (singleton, window_start, attempts)
  VALUES (true, now(), 1)
  ON CONFLICT (singleton) DO UPDATE SET
    window_start = CASE WHEN limits.window_start <= now() - interval '10 minutes' THEN now() ELSE limits.window_start END,
    attempts = CASE WHEN limits.window_start <= now() - interval '10 minutes' THEN 1 ELSE LEAST(limits.attempts + 1, 11) END
  RETURNING attempts <= 10;
$$;
REVOKE ALL ON FUNCTION public.consume_admin_login_attempt() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_admin_login_attempt() TO service_role;
