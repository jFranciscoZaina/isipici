-- M21. Apply manually AFTER M20. No provider integration changes.
BEGIN;

CREATE TABLE public.audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid REFERENCES public.owners(id) ON DELETE RESTRICT,
 actor_kind text NOT NULL CHECK(actor_kind IN ('admin','user','legacy','system')),
 actor_user_id uuid REFERENCES public.user_profiles(user_id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(action ~ '^[a-z_]+[.][a-z_]+$'),
 entity_type text NOT NULL CHECK(entity_type IN ('business','invite','membership','client','plan','subscription','user')),
 entity_id uuid,
 metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=2048),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((actor_kind='user')=(actor_user_id IS NOT NULL))
);
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.audit_events TO service_role;
CREATE INDEX audit_owner_created ON public.audit_events(owner_id,created_at DESC,id DESC);
CREATE INDEX audit_created ON public.audit_events(created_at DESC,id DESC);
CREATE INDEX audit_owner_meaningful ON public.audit_events(owner_id,created_at DESC) WHERE action<>'auth.login';
CREATE INDEX audit_owner_login ON public.audit_events(owner_id,created_at DESC) WHERE action='auth.login';
CREATE INDEX IF NOT EXISTS owners_admin_created ON public.owners(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS payments_admin_owner_type ON public.payments(owner_id,payment_type);
CREATE INDEX IF NOT EXISTS memberships_admin_active_owner ON public.owner_memberships(owner_id,user_id) WHERE revoked_at IS NULL AND role='owner';

-- Pick the deployed client ownership column once. The simple invoker view retains index pushdown.
DO $migration$
DECLARE owner_column text;
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='clients' AND c.column_name='owner_id') THEN 'owner_id' ELSE 'gym_id' END INTO owner_column;
 EXECUTE format('CREATE INDEX IF NOT EXISTS clients_admin_owner ON public.clients(%I)',owner_column);
 EXECUTE format('CREATE VIEW public.admin_client_owners WITH (security_invoker=true) AS SELECT id,%I AS owner_id,created_at FROM public.clients',owner_column);
END $migration$;
REVOKE ALL ON public.admin_client_owners FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.admin_client_owners TO service_role;

CREATE FUNCTION public.audit_history_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN RAISE EXCEPTION 'AUDIT_HISTORY_IMMUTABLE'; END $fn$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.audit_history_immutable();

-- Only private, service-role requests can supply actor headers.
-- The app derives these headers from verified Auth/Admin context, never from browser input.
CREATE FUNCTION public.emit_product_audit(p_owner uuid,p_action text,p_entity text,p_id uuid,p_meta jsonb DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE headers jsonb; claims jsonb; kind text:='system'; actor uuid; scoped_owner uuid;
BEGIN
 headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
 IF coalesce(claims->>'role',current_setting('request.jwt.claim.role',true))='service_role' THEN
  kind:=coalesce(headers->>'x-isipici-actor-kind','system');
  IF kind NOT IN ('admin','user','legacy','system') THEN RAISE EXCEPTION 'AUDIT_CONTEXT_INVALID'; END IF;
  IF kind='user' THEN actor:=nullif(headers->>'x-isipici-actor-user','')::uuid; IF actor IS NULL THEN RAISE EXCEPTION 'AUDIT_CONTEXT_INVALID'; END IF; END IF;
  scoped_owner:=nullif(headers->>'x-isipici-actor-owner','')::uuid;
  IF kind IN ('user','legacy') AND p_owner IS NOT NULL AND scoped_owner IS NOT NULL AND scoped_owner<>p_owner THEN RAISE EXCEPTION 'AUDIT_OWNER_MISMATCH'; END IF;
  IF kind='user' AND p_owner IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.owner_memberships m WHERE m.owner_id=p_owner AND m.user_id=actor AND m.role='owner' AND m.revoked_at IS NULL) THEN RAISE EXCEPTION 'AUDIT_MEMBERSHIP_INVALID'; END IF;
 END IF;
 -- p_meta is constructed only by internal triggers; no exposed RPC accepts arbitrary metadata.
 INSERT INTO public.audit_events(owner_id,actor_kind,actor_user_id,action,entity_type,entity_id,metadata)
 VALUES(p_owner,kind,actor,p_action,p_entity,p_id,coalesce(p_meta,'{}'));
END $fn$;
REVOKE ALL ON FUNCTION public.emit_product_audit(uuid,text,text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.capture_product_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE n jsonb:=to_jsonb(NEW); o jsonb:='{}'; owner uuid; identity uuid; fields text[]; changed text[]; field text; action text; entity text;
BEGIN
 IF TG_OP='UPDATE' THEN o:=to_jsonb(OLD); END IF;
 identity:=coalesce(n->>'id',n->>'user_id')::uuid;
 owner:=CASE WHEN TG_TABLE_NAME='owners' THEN identity ELSE coalesce(n->>'owner_id',n->>'gym_id')::uuid END;
 CASE TG_TABLE_NAME
 WHEN 'owners' THEN
  IF TG_OP='INSERT' THEN
   PERFORM public.emit_product_audit(owner,'business.created','business',identity,jsonb_build_object('active',NEW.is_active,'legacy_enabled',NEW.legacy_login_enabled));
   RETURN NEW;
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
   PERFORM public.emit_product_audit(owner,CASE WHEN NEW.is_active THEN 'business.enabled' ELSE 'business.disabled' END,'business',identity,jsonb_build_object('active',NEW.is_active));
  END IF;
  IF NEW.legacy_login_enabled IS DISTINCT FROM OLD.legacy_login_enabled THEN
   PERFORM public.emit_product_audit(owner,CASE WHEN NEW.legacy_login_enabled THEN 'legacy_access.enabled' ELSE 'legacy_access.disabled' END,'business',identity,'{}');
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email OR NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
   PERFORM public.emit_product_audit(owner,'legacy_access.credentials_changed','business',identity,'{}');
  END IF;
  fields:=ARRAY['name','contact_email','country','business_type','default_currency','timezone','max_owner_members'];
  entity:='business';action:='business.updated';
 WHEN 'clients' THEN
  entity:='client';fields:=ARRAY['name','email','phone','address','address_number','due_day','archived_at'];
  IF TG_OP='INSERT' THEN action:='client.created';
  ELSIF n->'archived_at' IS DISTINCT FROM o->'archived_at' THEN action:=CASE WHEN n->>'archived_at' IS NULL THEN 'client.reactivated' ELSE 'client.archived' END;
  ELSE action:='client.updated'; END IF;
 WHEN 'plans' THEN
  entity:='plan';fields:=ARRAY['name','frequency','archived_at'];
  action:=CASE WHEN TG_OP='INSERT' THEN 'plan.created' WHEN n->'archived_at' IS DISTINCT FROM o->'archived_at' THEN 'plan.archived' ELSE 'plan.updated' END;
 WHEN 'plan_prices' THEN
  PERFORM public.emit_product_audit(owner,'plan.updated','plan',(n->>'plan_id')::uuid,jsonb_build_object('price_changed',true,'effective_from',n->>'effective_from'));
  RETURN NEW;
 WHEN 'recurring_agreements' THEN
  entity:='subscription';action:='subscription.changed';
  -- next_charge_at and snapshot timestamps change on GET: intentionally excluded.
  fields:=ARRAY['status','amount','currency','plan_id','interval_unit','interval_count','billing_anchor_date','cancel_at_period_end','cancellation_boundary','installments_enabled'];
 WHEN 'subscription_changes' THEN
  entity:='subscription';identity:=(n->>'recurring_agreement_id')::uuid;action:='subscription.changed';
  fields:=ARRAY['status','target_plan_id','new_amount','new_frequency','effective_from','starts_on'];
 WHEN 'owner_memberships' THEN
  IF TG_OP='INSERT' THEN action:='membership.added';
  ELSIF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN action:='membership.revoked';
  ELSE RETURN NEW; END IF;
  PERFORM public.emit_product_audit(owner,action,'membership',identity,jsonb_build_object('subject_user_id',n->>'user_id'));
  RETURN NEW;
 WHEN 'workspace_invites' THEN
  IF TG_OP='INSERT' THEN action:='invite.created';
  ELSIF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN action:='invite.revoked';
  ELSIF NEW.used_count>OLD.used_count THEN action:='invite.redeemed';
  ELSE RETURN NEW; END IF;
  PERFORM public.emit_product_audit(owner,action,'invite',identity,jsonb_build_object('max_uses',NEW.max_uses,'used_count',NEW.used_count));
  RETURN NEW;
 WHEN 'user_profiles' THEN
  IF NEW.last_login_at IS NOT NULL AND (TG_OP='INSERT' OR n->'last_login_at' IS DISTINCT FROM o->'last_login_at') THEN
   PERFORM public.emit_product_audit(NULL,'auth.login','user',identity,'{}');
  END IF;
  RETURN NEW;
 ELSE RETURN NEW;
 END CASE;
 changed:=ARRAY[]::text[];
 FOREACH field IN ARRAY fields LOOP IF n->field IS DISTINCT FROM o->field THEN changed:=array_append(changed,field); END IF; END LOOP;
 IF TG_OP='INSERT' OR cardinality(changed)>0 THEN PERFORM public.emit_product_audit(owner,action,entity,identity,jsonb_build_object('changed_fields',to_jsonb(changed))); END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.capture_product_audit() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.audit_history_immutable() FROM PUBLIC,anon,authenticated,service_role;
DO $migration$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['owners','clients','plans','plan_prices','recurring_agreements','subscription_changes','owner_memberships','workspace_invites','user_profiles'] LOOP
  EXECUTE format('CREATE TRIGGER product_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_product_audit()',table_name);
 END LOOP;
END $migration$;

CREATE FUNCTION public.record_legacy_login(p_owner uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.owners WHERE id=p_owner AND is_active AND legacy_login_enabled) THEN RAISE EXCEPTION 'AUDIT_LOGIN_UNAVAILABLE'; END IF;
 PERFORM public.emit_product_audit(p_owner,'auth.login','business',p_owner,'{}');
END $fn$;
REVOKE ALL ON FUNCTION public.record_legacy_login(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_legacy_login(uuid) TO service_role;

-- One snapshot; counts come from real tables, not audit. Null/unknown payment types stay separate.
CREATE FUNCTION public.admin_platform_summary() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
 WITH members AS (SELECT owner_id,count(*) n FROM public.owner_memberships WHERE revoked_at IS NULL AND role='owner' GROUP BY owner_id),
 businesses AS (SELECT count(*) total,count(*) FILTER(WHERE o.is_active) active,count(*) FILTER(WHERE m.n IS NULL) zero_owners FROM public.owners o LEFT JOIN members m ON m.owner_id=o.id),
 payments AS (SELECT count(*) total,count(*) FILTER(WHERE payment_type='recurring') recurring,count(*) FILTER(WHERE payment_type='one_off') one_off,count(*) FILTER(WHERE payment_type IS NULL OR payment_type NOT IN ('recurring','one_off')) unclassified FROM public.payments)
 SELECT jsonb_build_object('businesses',b.total,'activeBusinesses',b.active,'users',(SELECT count(*) FROM auth.users),'profiles',(SELECT count(*) FROM public.user_profiles),'activeMemberships',coalesce((SELECT sum(n) FROM members),0),'zeroOwnerBusinesses',b.zero_owners,'pendingInvites',(SELECT count(*) FROM public.workspace_invites WHERE revoked_at IS NULL AND expires_at>now() AND used_count<max_uses),'clients',(SELECT count(*) FROM public.clients),'payments',p.total,'recurringPayments',p.recurring,'oneOffPayments',p.one_off,'unclassifiedPayments',p.unclassified,'asOf',now()) FROM businesses b CROSS JOIN payments p;
$fn$;
REVOKE ALL ON FUNCTION public.admin_platform_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_platform_summary() TO service_role;

CREATE FUNCTION public.admin_business_summary(p_page integer DEFAULT 1,p_page_size integer DEFAULT 20,p_query text DEFAULT '',p_owner uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE result jsonb; term text;
BEGIN
 IF p_page IS NULL OR p_page_size IS NULL OR p_page<1 OR p_page>100000 OR p_page_size<1 OR p_page_size>100 OR length(p_query)>100 THEN RAISE EXCEPTION 'ADMIN_PAGE_INVALID'; END IF;
 term:='%'||replace(replace(replace(coalesce(p_query,''),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 WITH selected AS MATERIALIZED (
  SELECT id,name,email,contact_email,country,business_type,timezone,default_currency,is_active,legacy_login_enabled,max_owner_members,created_at
  FROM public.owners WHERE (p_owner IS NULL OR id=p_owner) AND (coalesce(p_query,'')='' OR name ILIKE term OR contact_email ILIKE term OR email ILIKE term)
  ORDER BY created_at DESC,id DESC LIMIT p_page_size OFFSET (p_page-1)*p_page_size
 ),
 clients AS (SELECT c.owner_id,count(*) n,max(c.created_at) last_created FROM public.admin_client_owners c JOIN selected s ON s.id=c.owner_id GROUP BY c.owner_id),
 payments AS (SELECT p.owner_id,count(*) n,count(*) FILTER(WHERE p.payment_type='recurring') recurring,count(*) FILTER(WHERE p.payment_type='one_off') one_off,count(*) FILTER(WHERE p.payment_type IS NULL OR p.payment_type NOT IN ('recurring','one_off')) unclassified,max(p.created_at) last_payment FROM public.payments p JOIN selected s ON s.id=p.owner_id GROUP BY p.owner_id),
 memberships AS (SELECT m.owner_id,count(*) n,max(u.last_login_at) last_login FROM public.owner_memberships m JOIN selected s ON s.id=m.owner_id JOIN public.user_profiles u ON u.user_id=m.user_id WHERE m.role='owner' AND m.revoked_at IS NULL GROUP BY m.owner_id),
 invites AS (SELECT i.owner_id,count(*) n FROM public.workspace_invites i JOIN selected s ON s.id=i.owner_id WHERE i.revoked_at IS NULL AND i.expires_at>now() AND i.used_count<i.max_uses GROUP BY i.owner_id),
 rows AS (
  SELECT s.*,coalesce(c.n,0) AS "clientCount",coalesce(p.n,0) AS "paymentCount",coalesce(p.recurring,0) AS "recurringCount",coalesce(p.one_off,0) AS "oneOffCount",coalesce(p.unclassified,0) AS "unclassifiedCount",coalesce(m.n,0) AS "modernOwnerCount",coalesce(i.n,0) AS "pendingInviteCount",
   greatest(m.last_login,(SELECT max(a.created_at) FROM public.audit_events a WHERE a.owner_id=s.id AND a.action='auth.login')) AS "lastLoginAt",
   greatest(c.last_created,p.last_payment,(SELECT max(a.created_at) FROM public.audit_events a WHERE a.owner_id=s.id AND a.action<>'auth.login')) AS "lastActivityAt"
  FROM selected s LEFT JOIN clients c ON c.owner_id=s.id LEFT JOIN payments p ON p.owner_id=s.id LEFT JOIN memberships m ON m.owner_id=s.id LEFT JOIN invites i ON i.owner_id=s.id
 )
 SELECT jsonb_build_object('businesses',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC) FROM rows r),'[]'::jsonb),'total',(SELECT count(*) FROM public.owners WHERE (p_owner IS NULL OR id=p_owner) AND (coalesce(p_query,'')='' OR name ILIKE term OR contact_email ILIKE term OR email ILIKE term)),'page',p_page,'pageSize',p_page_size) INTO result;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_business_summary(integer,integer,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_business_summary(integer,integer,text,uuid) TO service_role;

CREATE FUNCTION public.admin_audit_page(p_owner uuid DEFAULT NULL,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE result jsonb;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 OR (p_before IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'ADMIN_PAGE_INVALID'; END IF;
 IF p_owner IS NULL THEN
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb) INTO result FROM (
   SELECT id,owner_id,actor_kind,actor_user_id,action,entity_type,entity_id,metadata,created_at FROM public.audit_events
   WHERE p_before IS NULL OR (created_at,id)<(p_before,p_before_id)
   ORDER BY created_at DESC,id DESC LIMIT p_limit+1
  ) r;
 ELSE
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb) INTO result FROM (
   SELECT id,owner_id,actor_kind,actor_user_id,action,entity_type,entity_id,metadata,created_at FROM public.audit_events
   WHERE owner_id=p_owner AND (p_before IS NULL OR (created_at,id)<(p_before,p_before_id))
   ORDER BY created_at DESC,id DESC LIMIT p_limit+1
  ) r;
 END IF;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_audit_page(uuid,timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_audit_page(uuid,timestamptz,uuid,integer) TO service_role;
COMMIT;
