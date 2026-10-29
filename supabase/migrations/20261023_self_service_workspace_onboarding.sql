-- M23. Self-service workspace onboarding. Apply manually AFTER M20/M21.
-- Product rule for this stage: one active owner workspace per modern user.
BEGIN;

DO $migration$
BEGIN
 IF EXISTS (
  SELECT user_id
  FROM public.owner_memberships
  WHERE revoked_at IS NULL AND role='owner'
  GROUP BY user_id
  HAVING count(*)>1
 ) THEN
  RAISE EXCEPTION 'ONE_WORKSPACE_MIGRATION_REQUIRES_MANUAL_RESOLUTION';
 END IF;
END $migration$;

CREATE UNIQUE INDEX IF NOT EXISTS owner_memberships_one_active_workspace_per_user
 ON public.owner_memberships(user_id)
 WHERE revoked_at IS NULL AND role='owner';

CREATE TABLE public.workspace_creation_requests (
 user_id uuid PRIMARY KEY REFERENCES public.user_profiles(user_id) ON DELETE RESTRICT,
 contact_email text NOT NULL,
 code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 window_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 send_count integer NOT NULL DEFAULT 1 CHECK (send_count BETWEEN 1 AND 5),
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK (length(contact_email)<=254 AND contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

ALTER TABLE public.workspace_creation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_creation_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.workspace_creation_requests TO service_role;

CREATE OR REPLACE FUNCTION public.workspace_begin_self_service_verification(
 p_user uuid,
 p_email text,
 p_hash text,
 p_expires timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path=pg_catalog,public,pg_temp
AS $fn$
DECLARE existing public.workspace_creation_requests;
DECLARE now_at timestamptz:=clock_timestamp();
DECLARE next_count integer;
DECLARE next_window timestamptz;
BEGIN
 PERFORM 1 FROM public.user_profiles WHERE user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','user_unavailable'); END IF;

 IF EXISTS(SELECT 1 FROM public.owner_memberships WHERE user_id=p_user AND role='owner' AND revoked_at IS NULL) THEN
  RETURN jsonb_build_object('ok',false,'reason','already_joined');
 END IF;

 p_email:=lower(btrim(p_email));
 IF p_email IS NULL OR length(p_email)>254 OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  OR p_hash !~ '^[0-9a-f]{64}$'
  OR p_expires<=now_at OR p_expires>now_at+interval '15 minutes'
 THEN
  RETURN jsonb_build_object('ok',false,'reason','invalid_input');
 END IF;

 SELECT * INTO existing FROM public.workspace_creation_requests WHERE user_id=p_user FOR UPDATE;
 IF FOUND AND existing.consumed_at IS NULL AND existing.sent_at>now_at-interval '60 seconds' THEN
  RETURN jsonb_build_object('ok',false,'reason','cooldown');
 END IF;

 IF FOUND AND existing.window_started_at>now_at-interval '1 hour' THEN
  IF existing.send_count>=5 THEN RETURN jsonb_build_object('ok',false,'reason','rate_limited'); END IF;
  next_count:=existing.send_count+1;
  next_window:=existing.window_started_at;
 ELSE
  next_count:=1;
  next_window:=now_at;
 END IF;

 INSERT INTO public.workspace_creation_requests(
  user_id,contact_email,code_hash,expires_at,sent_at,attempts,window_started_at,send_count,consumed_at,created_at,updated_at
 ) VALUES (
  p_user,p_email,p_hash,p_expires,now_at,0,next_window,next_count,NULL,coalesce(existing.created_at,now_at),now_at
 )
 ON CONFLICT(user_id) DO UPDATE SET
  contact_email=excluded.contact_email,
  code_hash=excluded.code_hash,
  expires_at=excluded.expires_at,
  sent_at=excluded.sent_at,
  attempts=0,
  window_started_at=excluded.window_started_at,
  send_count=excluded.send_count,
  consumed_at=NULL,
  updated_at=excluded.updated_at;

 RETURN jsonb_build_object('ok',true);
END
$fn$;

CREATE OR REPLACE FUNCTION public.workspace_create_self_service(
 p_user uuid,
 p_name text,
 p_contact_email text,
 p_currency text,
 p_timezone text DEFAULT NULL,
 p_country text DEFAULT NULL,
 p_business_type text DEFAULT NULL,
 p_code_hash text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path=pg_catalog,public,pg_temp
AS $fn$
DECLARE profile_email text;
DECLARE contact text;
DECLARE request_row public.workspace_creation_requests;
DECLARE created_owner public.owners;
DECLARE created_membership public.owner_memberships;
DECLARE needs_verification boolean;
BEGIN
 SELECT lower(btrim(email)) INTO profile_email
 FROM public.user_profiles
 WHERE user_id=p_user
 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','user_unavailable'); END IF;

 IF EXISTS(SELECT 1 FROM public.owner_memberships WHERE user_id=p_user AND role='owner' AND revoked_at IS NULL) THEN
  RETURN jsonb_build_object('ok',false,'reason','already_joined');
 END IF;

 p_name:=btrim(p_name);
 contact:=lower(btrim(p_contact_email));
 p_timezone:=nullif(btrim(p_timezone),'');
 p_country:=nullif(btrim(p_country),'');
 p_business_type:=nullif(btrim(p_business_type),'');

 IF p_name IS NULL OR p_name='' OR length(p_name)>200
  OR contact IS NULL OR length(contact)>254 OR contact !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  OR p_currency NOT IN ('ARS','AUD')
  OR (p_timezone IS NOT NULL AND length(p_timezone)>100)
  OR (p_country IS NOT NULL AND length(p_country)>100)
  OR (p_business_type IS NOT NULL AND length(p_business_type)>200)
 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_input'); END IF;

 needs_verification:=profile_email IS NULL OR profile_email<>contact;

 IF needs_verification THEN
  SELECT * INTO request_row
  FROM public.workspace_creation_requests
  WHERE user_id=p_user AND contact_email=contact AND consumed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','verification_required'); END IF;
  IF request_row.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'reason','expired_code'); END IF;
  IF request_row.attempts>=5 THEN RETURN jsonb_build_object('ok',false,'reason','attempts_exhausted'); END IF;
  IF p_code_hash IS NULL OR p_code_hash<>request_row.code_hash THEN
   UPDATE public.workspace_creation_requests
    SET attempts=least(attempts+1,5),updated_at=clock_timestamp()
    WHERE user_id=p_user;
   RETURN jsonb_build_object('ok',false,'reason','invalid_code','attemptsLeft',greatest(4-request_row.attempts,0));
  END IF;
 END IF;

 INSERT INTO public.owners(
  name,contact_email,email,password_hash,legacy_login_enabled,default_currency,timezone,country,business_type,max_owner_members
 ) VALUES (
  p_name,contact,NULL,NULL,false,p_currency,p_timezone,p_country,p_business_type,2
 )
 RETURNING * INTO created_owner;

 INSERT INTO public.owner_memberships(owner_id,user_id,role)
 VALUES(created_owner.id,p_user,'owner')
 RETURNING * INTO created_membership;

 IF needs_verification THEN
  UPDATE public.workspace_creation_requests
   SET consumed_at=clock_timestamp(),updated_at=clock_timestamp()
   WHERE user_id=p_user;
 END IF;

 RETURN jsonb_build_object(
  'ok',true,
  'ownerId',created_owner.id,
  'membershipId',created_membership.id,
  'name',created_owner.name
 );
END
$fn$;

-- Preserve invite replay for the same invite, but prevent joining a second active workspace.
CREATE OR REPLACE FUNCTION public.workspace_redeem_invite(
 p_hash text,p_user uuid,p_email text,p_display text,p_last_login timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path=public
AS $fn$
DECLARE business uuid;
DECLARE invitation public.workspace_invites;
DECLARE membership public.owner_memberships;
DECLARE capacity integer;
BEGIN
 PERFORM 1 FROM public.user_profiles WHERE user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_UNAVAILABLE'; END IF;

 SELECT owner_id INTO business FROM public.workspace_invites WHERE code_hash=p_hash;
 IF business IS NULL THEN RAISE EXCEPTION 'INVITE_UNAVAILABLE'; END IF;

 SELECT max_owner_members INTO capacity FROM public.owners WHERE id=business AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_UNAVAILABLE'; END IF;

 SELECT * INTO invitation FROM public.workspace_invites WHERE code_hash=p_hash AND owner_id=business FOR UPDATE;
 IF NOT FOUND OR invitation.revoked_at IS NOT NULL OR invitation.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'INVITE_UNAVAILABLE'; END IF;

 SELECT * INTO membership
 FROM public.owner_memberships
 WHERE user_id=p_user AND role='owner' AND revoked_at IS NULL
 LIMIT 1;

 IF FOUND THEN
  IF membership.owner_id=business AND membership.workspace_invite_id=invitation.id THEN
   RETURN jsonb_build_object('membershipId',membership.id,'ownerId',business,'duplicate',true);
  END IF;
  RAISE EXCEPTION 'USER_ALREADY_HAS_WORKSPACE';
 END IF;

 IF invitation.used_count>=invitation.max_uses
  OR (SELECT count(*) FROM public.owner_memberships WHERE owner_id=business AND role='owner' AND revoked_at IS NULL)>=capacity
 THEN RAISE EXCEPTION 'INVITE_UNAVAILABLE'; END IF;

 INSERT INTO public.user_profiles(user_id,email,display_name,last_login_at)
 VALUES(p_user,p_email,p_display,p_last_login)
 ON CONFLICT(user_id) DO UPDATE SET
  email=excluded.email,
  display_name=excluded.display_name,
  last_login_at=greatest(user_profiles.last_login_at,excluded.last_login_at);

 INSERT INTO public.owner_memberships(owner_id,user_id,workspace_invite_id)
 VALUES(business,p_user,invitation.id)
 RETURNING * INTO membership;

 UPDATE public.workspace_invites SET used_count=used_count+1 WHERE id=invitation.id;

 RETURN jsonb_build_object('membershipId',membership.id,'ownerId',business,'duplicate',false);
END
$fn$;

REVOKE ALL ON FUNCTION public.workspace_begin_self_service_verification(uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.workspace_create_self_service(uuid,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.workspace_redeem_invite(text,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_begin_self_service_verification(uuid,text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.workspace_create_self_service(uuid,text,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.workspace_redeem_invite(text,uuid,text,text,timestamptz) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
