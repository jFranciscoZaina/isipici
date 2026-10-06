-- RLS en tablas public expuestas por PostgREST.
-- La app no usa Supabase Auth: el acceso a datos va por las API de Next
-- con la service_role (bypasea RLS). anon/authenticated quedan bloqueados.

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.clients FROM anon, authenticated;
REVOKE ALL ON TABLE public.payments FROM anon, authenticated;
REVOKE ALL ON TABLE public.owners FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_logs FROM anon, authenticated;

GRANT ALL ON TABLE public.clients TO service_role;
GRANT ALL ON TABLE public.payments TO service_role;
GRANT ALL ON TABLE public.owners TO service_role;
GRANT ALL ON TABLE public.email_logs TO service_role;
