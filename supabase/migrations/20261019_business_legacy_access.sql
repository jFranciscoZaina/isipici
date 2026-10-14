BEGIN;
ALTER TABLE public.owners ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE public.owners ADD COLUMN IF NOT EXISTS legacy_login_enabled boolean;
ALTER TABLE public.owners ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE public.owners ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.owners ADD COLUMN IF NOT EXISTS business_type text;
ALTER TABLE public.owners ADD COLUMN IF NOT EXISTS legacy_session_version bigint NOT NULL DEFAULT 0;
ALTER TABLE public.owners ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.owners ALTER COLUMN password_hash DROP NOT NULL;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='owners' AND column_name='pin_hash') THEN
  ALTER TABLE public.owners ALTER COLUMN pin_hash DROP NOT NULL;
 END IF;
END $$;
UPDATE public.owners SET contact_email=email WHERE contact_email IS NULL AND email IS NOT NULL;
UPDATE public.owners SET legacy_login_enabled=(email IS NOT NULL AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' AND password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$') WHERE legacy_login_enabled IS NULL;
UPDATE public.owners SET legacy_login_enabled=false WHERE legacy_login_enabled IS NULL;
ALTER TABLE public.owners ALTER COLUMN legacy_login_enabled SET DEFAULT false;
ALTER TABLE public.owners ALTER COLUMN legacy_login_enabled SET NOT NULL;
-- Duplicate case-insensitive logins require manual resolution; never merge/delete businesses.
CREATE UNIQUE INDEX IF NOT EXISTS owners_legacy_email_normalized_unique ON public.owners(lower(btrim(email))) WHERE email IS NOT NULL;
CREATE OR REPLACE FUNCTION public.guard_business_access() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' AND (NEW.contact_email IS NULL OR length(NEW.contact_email)>254 OR NEW.contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN
  RAISE EXCEPTION 'BUSINESS_CONTACT_REQUIRED';
 END IF;
 IF TG_OP='UPDATE' AND NEW.contact_email IS DISTINCT FROM OLD.contact_email AND (NEW.contact_email IS NULL OR length(NEW.contact_email)>254 OR NEW.contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN
  RAISE EXCEPTION 'BUSINESS_CONTACT_INVALID';
 END IF;
 IF NEW.legacy_login_enabled AND (NEW.email IS NULL OR length(NEW.email)>254 OR NEW.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR NEW.password_hash IS NULL OR NEW.password_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$') THEN
  RAISE EXCEPTION 'BUSINESS_LEGACY_CREDENTIALS_REQUIRED';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.email IS DISTINCT FROM OLD.email OR NEW.password_hash IS DISTINCT FROM OLD.password_hash OR NEW.legacy_login_enabled IS DISTINCT FROM OLD.legacy_login_enabled OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
   NEW.legacy_session_version:=OLD.legacy_session_version+1;
  ELSE NEW.legacy_session_version:=OLD.legacy_session_version;
  END IF;
 ELSE NEW.legacy_session_version:=0;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS owners_business_access_guard ON public.owners;
CREATE TRIGGER owners_business_access_guard BEFORE INSERT OR UPDATE ON public.owners FOR EACH ROW EXECUTE FUNCTION public.guard_business_access();
COMMENT ON TABLE public.owners IS 'Business/workspace. Legacy email/password are optional login credentials, not business contact.';
COMMENT ON COLUMN public.owners.contact_email IS 'Business contact; never implicitly a login identifier.';
COMMENT ON COLUMN public.owners.email IS 'Deprecated account model: optional classic login email.';
COMMENT ON COLUMN public.owners.password_hash IS 'Optional bcrypt hash for classic login; no plaintext.';
COMMENT ON COLUMN public.owners.timezone IS 'Optional IANA timezone metadata; payment/date logic remains unchanged.';
NOTIFY pgrst,'reload schema';
COMMIT;
