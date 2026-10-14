BEGIN;
ALTER TABLE public.owners ADD COLUMN IF NOT EXISTS max_owner_members integer NOT NULL DEFAULT 2;
ALTER TABLE public.owners ADD CONSTRAINT owners_max_owner_members_check CHECK (max_owner_members BETWEEN 0 AND 1000);
CREATE TABLE public.user_profiles (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 email text, display_name text CHECK (length(display_name)<=200),
 created_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz
);
CREATE TABLE public.owner_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE RESTRICT,
 role text NOT NULL DEFAULT 'owner', created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 CONSTRAINT owner_memberships_role_check CHECK (role IN ('owner'))
);
CREATE UNIQUE INDEX owner_memberships_one_active ON public.owner_memberships(owner_id,user_id) WHERE revoked_at IS NULL;
CREATE INDEX owner_memberships_user_active ON public.owner_memberships(user_id,owner_id) WHERE revoked_at IS NULL;
CREATE TABLE public.workspace_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
 role text NOT NULL DEFAULT 'owner', code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days', max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 100),
 used_count integer NOT NULL DEFAULT 0 CHECK (used_count>=0 AND used_count<=max_uses), revoked_at timestamptz,
 created_by_user_id uuid REFERENCES public.user_profiles(user_id) ON DELETE RESTRICT,
 created_via text NOT NULL CHECK (created_via IN ('admin','owner')), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,owner_id),
 CONSTRAINT workspace_invites_role_check CHECK (role IN ('owner')),
 CONSTRAINT workspace_invites_creator_check CHECK ((created_via='admin' AND created_by_user_id IS NULL) OR (created_via='owner' AND created_by_user_id IS NOT NULL))
);
CREATE INDEX workspace_invites_pending ON public.workspace_invites(owner_id,expires_at) WHERE revoked_at IS NULL;
ALTER TABLE public.owner_memberships ADD COLUMN workspace_invite_id uuid;
ALTER TABLE public.owner_memberships ADD CONSTRAINT memberships_invite_workspace_fk FOREIGN KEY(workspace_invite_id,owner_id) REFERENCES public.workspace_invites(id,owner_id) ON DELETE RESTRICT;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_profiles,public.owner_memberships,public.workspace_invites FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.user_profiles,public.owner_memberships,public.workspace_invites TO service_role;

CREATE FUNCTION public.guard_workspace_membership() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE capacity integer; taken integer; active boolean;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'MEMBERSHIP_HISTORY_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW.owner_id,NEW.user_id,NEW.role,NEW.created_at,NEW.workspace_invite_id) IS DISTINCT FROM ROW(OLD.id,OLD.owner_id,OLD.user_id,OLD.role,OLD.created_at,OLD.workspace_invite_id) OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN RAISE EXCEPTION 'MEMBERSHIP_HISTORY_IMMUTABLE'; END IF;
 END IF;
 -- Touching the locked business also forces serialization failures under repeatable-read/serializable.
 UPDATE public.owners SET max_owner_members=max_owner_members WHERE id=NEW.owner_id RETURNING max_owner_members,is_active INTO capacity,active;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_UNAVAILABLE'; END IF;
 IF NEW.revoked_at IS NULL AND NEW.role='owner' AND TG_OP='INSERT' THEN
  IF NOT active THEN RAISE EXCEPTION 'WORKSPACE_UNAVAILABLE'; END IF;
  SELECT count(*) INTO taken FROM public.owner_memberships WHERE owner_id=NEW.owner_id AND revoked_at IS NULL AND role='owner';
  IF taken>=capacity THEN RAISE EXCEPTION 'WORKSPACE_OWNER_LIMIT'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workspace_membership_guard BEFORE INSERT OR UPDATE OR DELETE ON public.owner_memberships FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_membership();
CREATE FUNCTION public.guard_workspace_owner_limit() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.max_owner_members IS DISTINCT FROM OLD.max_owner_members AND NEW.max_owner_members<(SELECT count(*) FROM public.owner_memberships WHERE owner_id=NEW.id AND revoked_at IS NULL AND role='owner') THEN RAISE EXCEPTION 'WORKSPACE_LIMIT_BELOW_USAGE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workspace_owner_limit_guard BEFORE UPDATE OF max_owner_members ON public.owners FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_owner_limit();
CREATE FUNCTION public.guard_workspace_invite() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'INVITE_HISTORY_IMMUTABLE'; END IF;
 IF ROW(NEW.id,NEW.owner_id,NEW.role,NEW.code_hash,NEW.expires_at,NEW.max_uses,NEW.created_by_user_id,NEW.created_via,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.owner_id,OLD.role,OLD.code_hash,OLD.expires_at,OLD.max_uses,OLD.created_by_user_id,OLD.created_via,OLD.created_at) OR NEW.used_count<OLD.used_count OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN RAISE EXCEPTION 'INVITE_HISTORY_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workspace_invite_guard BEFORE UPDATE OR DELETE ON public.workspace_invites FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_invite();

CREATE FUNCTION public.workspace_invite_actor(p_owner uuid,p_kind text,p_user uuid) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF p_kind='admin' AND p_user IS NULL THEN RETURN; END IF;
 IF p_kind='owner' AND EXISTS(SELECT 1 FROM public.owner_memberships WHERE owner_id=p_owner AND user_id=p_user AND role='owner' AND revoked_at IS NULL) THEN RETURN; END IF;
 RAISE EXCEPTION 'WORKSPACE_UNAVAILABLE';
END $$;
CREATE FUNCTION public.workspace_create_invite(p_owner uuid,p_hash text,p_expires timestamptz,p_max_uses integer,p_actor_kind text,p_actor_user uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE result public.workspace_invites;
BEGIN
 PERFORM 1 FROM public.owners WHERE id=p_owner AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_UNAVAILABLE'; END IF;
 PERFORM public.workspace_invite_actor(p_owner,p_actor_kind,p_actor_user);
 IF p_expires<=clock_timestamp() OR p_expires>clock_timestamp()+interval '30 days' OR p_expires IS NULL OR p_max_uses IS NULL THEN RAISE EXCEPTION 'WORKSPACE_INPUT_INVALID'; END IF;
 INSERT INTO public.workspace_invites(owner_id,code_hash,expires_at,max_uses,created_via,created_by_user_id) VALUES(p_owner,p_hash,p_expires,p_max_uses,p_actor_kind,p_actor_user) RETURNING * INTO result;
 RETURN jsonb_build_object('id',result.id,'expiresAt',result.expires_at,'maxUses',result.max_uses);
END $$;
CREATE FUNCTION public.workspace_revoke_invite(p_owner uuid,p_invite uuid,p_actor_kind text,p_actor_user uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.owners WHERE id=p_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_UNAVAILABLE'; END IF;
 PERFORM public.workspace_invite_actor(p_owner,p_actor_kind,p_actor_user);
 UPDATE public.workspace_invites SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE id=p_invite AND owner_id=p_owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_UNAVAILABLE'; END IF;
 RETURN true;
END $$;
CREATE FUNCTION public.workspace_redeem_invite(p_hash text,p_user uuid,p_email text,p_display text,p_last_login timestamptz DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE business uuid; invitation public.workspace_invites; membership public.owner_memberships; capacity integer;
BEGIN
 SELECT owner_id INTO business FROM public.workspace_invites WHERE code_hash=p_hash;
 IF business IS NULL THEN RAISE EXCEPTION 'INVITE_UNAVAILABLE'; END IF;
 SELECT max_owner_members INTO capacity FROM public.owners WHERE id=business AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_UNAVAILABLE'; END IF;
 SELECT * INTO invitation FROM public.workspace_invites WHERE code_hash=p_hash AND owner_id=business FOR UPDATE;
 IF NOT FOUND OR invitation.revoked_at IS NOT NULL OR invitation.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'INVITE_UNAVAILABLE'; END IF;
 SELECT * INTO membership FROM public.owner_memberships WHERE owner_id=business AND user_id=p_user AND revoked_at IS NULL;
 IF FOUND THEN
  IF membership.workspace_invite_id=invitation.id THEN RETURN jsonb_build_object('membershipId',membership.id,'ownerId',business,'duplicate',true); END IF;
  RAISE EXCEPTION 'INVITE_UNAVAILABLE';
 END IF;
 IF invitation.used_count>=invitation.max_uses OR (SELECT count(*) FROM public.owner_memberships WHERE owner_id=business AND role='owner' AND revoked_at IS NULL)>=capacity THEN RAISE EXCEPTION 'INVITE_UNAVAILABLE'; END IF;
 INSERT INTO public.user_profiles(user_id,email,display_name,last_login_at) VALUES(p_user,p_email,p_display,p_last_login) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,last_login_at=greatest(user_profiles.last_login_at,excluded.last_login_at);
 INSERT INTO public.owner_memberships(owner_id,user_id,workspace_invite_id) VALUES(business,p_user,invitation.id) RETURNING * INTO membership;
 UPDATE public.workspace_invites SET used_count=used_count+1 WHERE id=invitation.id;
 RETURN jsonb_build_object('membershipId',membership.id,'ownerId',business,'duplicate',false);
END $$;
CREATE FUNCTION public.workspace_revoke_membership(p_owner uuid,p_membership uuid) RETURNS boolean LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.owners WHERE id=p_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_UNAVAILABLE'; END IF;
 UPDATE public.owner_memberships SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE id=p_membership AND owner_id=p_owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_UNAVAILABLE'; END IF;
 RETURN true;
END $$;
CREATE FUNCTION public.workspace_set_owner_limit(p_owner uuid,p_limit integer) RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 UPDATE public.owners SET max_owner_members=p_limit WHERE id=p_owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_UNAVAILABLE'; END IF;
 RETURN p_limit;
END $$;
CREATE FUNCTION public.workspace_access_summary(p_owner uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE capacity integer;
BEGIN
 SELECT max_owner_members INTO capacity FROM public.owners WHERE id=p_owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_UNAVAILABLE'; END IF;
 RETURN jsonb_build_object('maxOwners',(SELECT max_owner_members FROM public.owners WHERE id=p_owner),'memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'userId',m.user_id,'role',m.role,'createdAt',m.created_at,'email',p.email,'displayName',p.display_name) ORDER BY m.created_at,m.id) FROM public.owner_memberships m JOIN public.user_profiles p ON p.user_id=m.user_id WHERE m.owner_id=p_owner AND m.revoked_at IS NULL),'[]'::jsonb),'invites',coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM (SELECT id,role,expires_at,max_uses,used_count,created_via,created_at FROM public.workspace_invites WHERE owner_id=p_owner AND revoked_at IS NULL AND expires_at>clock_timestamp() AND used_count<max_uses ORDER BY created_at DESC,id LIMIT 100) i),'[]'::jsonb));
END $$;
-- Private invoker functions: no exposed SECURITY DEFINER or authenticated/anonymous execute.
REVOKE ALL ON FUNCTION public.guard_workspace_membership(),public.guard_workspace_owner_limit(),public.guard_workspace_invite(),public.workspace_invite_actor(uuid,text,uuid),public.workspace_create_invite(uuid,text,timestamptz,integer,text,uuid),public.workspace_revoke_invite(uuid,uuid,text,uuid),public.workspace_redeem_invite(text,uuid,text,text,timestamptz),public.workspace_revoke_membership(uuid,uuid),public.workspace_set_owner_limit(uuid,integer),public.workspace_access_summary(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_invite_actor(uuid,text,uuid),public.workspace_create_invite(uuid,text,timestamptz,integer,text,uuid),public.workspace_revoke_invite(uuid,uuid,text,uuid),public.workspace_redeem_invite(text,uuid,text,text,timestamptz),public.workspace_revoke_membership(uuid,uuid),public.workspace_set_owner_limit(uuid,integer),public.workspace_access_summary(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
