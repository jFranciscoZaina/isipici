-- M24. Business tools + event foundation. Apply manually AFTER M23.
BEGIN;

ALTER TABLE public.owners
 ADD COLUMN IF NOT EXISTS enabled_tools text[] NOT NULL
 DEFAULT ARRAY['plans','payments']::text[];

UPDATE public.owners
SET enabled_tools=ARRAY['plans','payments']::text[]
WHERE enabled_tools IS NULL OR cardinality(enabled_tools)=0;

DO $migration$
BEGIN
 IF NOT EXISTS (
  SELECT 1
  FROM pg_constraint
  WHERE conname='owners_enabled_tools_valid'
   AND conrelid='public.owners'::regclass
 ) THEN
  ALTER TABLE public.owners
   ADD CONSTRAINT owners_enabled_tools_valid
   CHECK (
    cardinality(enabled_tools) BETWEEN 1 AND 3
    AND enabled_tools <@ ARRAY['plans','events','payments']::text[]
   );
 END IF;
END
$migration$;

COMMENT ON COLUMN public.owners.enabled_tools IS
 'Workspace modules enabled by the owner: plans, events, payments.';

CREATE TABLE IF NOT EXISTS public.business_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
 name text NOT NULL,
 description text,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz,
 timezone text NOT NULL,
 location text,
 capacity integer,
 status text NOT NULL DEFAULT 'draft',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT business_events_name_valid CHECK (length(btrim(name)) BETWEEN 1 AND 200),
 CONSTRAINT business_events_description_valid CHECK (description IS NULL OR length(description)<=2000),
 CONSTRAINT business_events_timezone_valid CHECK (length(btrim(timezone)) BETWEEN 1 AND 100),
 CONSTRAINT business_events_location_valid CHECK (location IS NULL OR length(location)<=300),
 CONSTRAINT business_events_capacity_valid CHECK (capacity IS NULL OR capacity>0),
 CONSTRAINT business_events_dates_valid CHECK (ends_at IS NULL OR ends_at>=starts_at),
 CONSTRAINT business_events_status_valid CHECK (status IN ('draft','scheduled','closed','cancelled','completed'))
);

CREATE INDEX IF NOT EXISTS business_events_owner_starts_idx
 ON public.business_events(owner_id,starts_at);

ALTER TABLE public.business_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.business_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.business_events TO service_role;

COMMENT ON TABLE public.business_events IS
 'Future-dated owner events. Capacity is optional; registrations/payments are intentionally modeled separately later.';

CREATE OR REPLACE FUNCTION public.workspace_create_self_service_v2(
 p_user uuid,
 p_name text,
 p_contact_email text,
 p_currency text,
 p_timezone text DEFAULT NULL,
 p_country text DEFAULT NULL,
 p_business_type text DEFAULT NULL,
 p_code_hash text DEFAULT NULL,
 p_enabled_tools text[] DEFAULT ARRAY['plans','payments']::text[]
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path=pg_catalog,public,pg_temp
AS $fn$
DECLARE result jsonb;
DECLARE normalized_tools text[];
DECLARE created_owner_id uuid;
BEGIN
 IF p_enabled_tools IS NULL
  OR cardinality(p_enabled_tools)=0
  OR EXISTS(
   SELECT 1
   FROM unnest(p_enabled_tools) AS tool
   WHERE tool NOT IN ('plans','events','payments')
  )
 THEN
  RETURN jsonb_build_object('ok',false,'reason','invalid_tools');
 END IF;

 SELECT array_agg(DISTINCT tool ORDER BY tool)
 INTO normalized_tools
 FROM unnest(p_enabled_tools) AS tool;

 result:=public.workspace_create_self_service(
  p_user,
  p_name,
  p_contact_email,
  p_currency,
  p_timezone,
  p_country,
  p_business_type,
  p_code_hash
 );

 IF coalesce((result->>'ok')::boolean,false) THEN
  created_owner_id:=(result->>'ownerId')::uuid;
  UPDATE public.owners
  SET enabled_tools=normalized_tools
  WHERE id=created_owner_id;
 END IF;

 RETURN result;
END
$fn$;

REVOKE ALL ON FUNCTION public.workspace_create_self_service_v2(
 uuid,text,text,text,text,text,text,text,text[]
) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.workspace_create_self_service_v2(
 uuid,text,text,text,text,text,text,text,text[]
) TO service_role;

NOTIFY pgrst,'reload schema';

COMMIT;
