-- M22: apply manually after M21 when audit is enabled. Does not create Auth identities.
BEGIN;
CREATE TABLE public.client_import_batches(
 owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE RESTRICT,
 id uuid NOT NULL,payload_hash text NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 500),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(owner_id,id)
);
ALTER TABLE public.client_import_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_import_batches FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.client_import_batches TO service_role;

DO $migration$
DECLARE owner_column text;
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='clients' AND c.column_name='owner_id') THEN 'owner_id' ELSE 'gym_id' END INTO owner_column;
 EXECUTE format('CREATE VIEW public.client_csv_records WITH (security_invoker=true) AS SELECT id,%I AS owner_id,name,email,phone,address,address_number,archived_at FROM public.clients',owner_column);
 EXECUTE format('CREATE INDEX IF NOT EXISTS clients_csv_email ON public.clients(%I,lower(btrim(email))) WHERE email IS NOT NULL',owner_column);
 EXECUTE format('CREATE INDEX IF NOT EXISTS clients_csv_phone ON public.clients(%I,regexp_replace(phone,''[^0-9]'','''',''g'')) WHERE phone IS NOT NULL',owner_column);
END $migration$;
REVOKE ALL ON public.client_csv_records FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.client_csv_records TO service_role;

CREATE FUNCTION public.client_csv_duplicates(p_owner uuid,p_emails text[],p_phones text[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN
 IF coalesce(cardinality(p_emails),0)>500 OR coalesce(cardinality(p_phones),0)>500 THEN RAISE EXCEPTION 'CLIENT_CSV_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.owners WHERE id=p_owner AND is_active) THEN RAISE EXCEPTION 'CLIENT_OWNER_DENIED'; END IF;
 RETURN jsonb_build_object(
 'emails',coalesce((SELECT jsonb_agg(DISTINCT lower(btrim(email))) FROM public.client_csv_records WHERE owner_id=p_owner AND email IS NOT NULL AND lower(btrim(email))=ANY(p_emails)),'[]'::jsonb),
 'phones',coalesce((SELECT jsonb_agg(DISTINCT regexp_replace(phone,'[^0-9]','','g')) FROM public.client_csv_records WHERE owner_id=p_owner AND phone IS NOT NULL AND regexp_replace(phone,'[^0-9]','','g')=ANY(p_phones)),'[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.client_csv_duplicates(uuid,text[],text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.client_csv_duplicates(uuid,text[],text[]) TO service_role;

-- M21 row audit is suspended only within the atomic import; one aggregate event replaces it.
DO $migration$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.clients'::regclass AND tgname='product_audit' AND NOT tgisinternal) THEN
  DROP TRIGGER product_audit ON public.clients;
  CREATE TRIGGER product_audit AFTER INSERT OR UPDATE ON public.clients FOR EACH ROW
   WHEN (current_setting('isipici.client_import',true) IS DISTINCT FROM 'true')
   EXECUTE FUNCTION public.capture_product_audit();
 END IF;
END $migration$;

CREATE FUNCTION public.export_clients_csv(p_owner uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE n integer; bytes bigint; records jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.owners WHERE id=p_owner AND is_active) THEN RAISE EXCEPTION 'CLIENT_OWNER_DENIED'; END IF;
 SELECT count(*),coalesce(sum(octet_length(coalesce(name,''))+octet_length(coalesce(email,''))+octet_length(coalesce(phone,''))+octet_length(coalesce(address,''))+octet_length(coalesce(address_number::text,''))),0)
 INTO n,bytes FROM (SELECT name,email,phone,address,address_number FROM public.client_csv_records WHERE owner_id=p_owner ORDER BY id LIMIT 10001) r;
 IF n>10000 OR bytes>8388608 THEN RAISE EXCEPTION 'CLIENT_EXPORT_TOO_LARGE'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) INTO records FROM (
  SELECT id,name,email,phone,address,address_number,archived_at FROM public.client_csv_records WHERE owner_id=p_owner ORDER BY id LIMIT 10000
 ) r;
 RETURN records;
END $fn$;
REVOKE ALL ON FUNCTION public.export_clients_csv(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.export_clients_csv(uuid) TO service_role;

CREATE FUNCTION public.import_clients_csv(p_owner uuid,p_import_id uuid,p_hash text,p_rows jsonb,p_allow_duplicates boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE configured text; previous public.client_import_batches; entry jsonb; key text; value text; n integer; owner_column text; emails text[]; phones text[]; signals jsonb; has_duplicates boolean; inserted integer;
BEGIN
 IF p_owner IS NULL OR p_import_id IS NULL OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR p_allow_duplicates IS NULL THEN RAISE EXCEPTION 'CLIENT_CSV_INVALID'; END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'CLIENT_CSV_INVALID'; END IF;
 n:=jsonb_array_length(p_rows);
 IF n<1 OR n>500 OR octet_length(p_rows::text)>2097152 THEN RAISE EXCEPTION 'CLIENT_CSV_INVALID'; END IF;
 SELECT default_currency INTO configured FROM public.owners WHERE id=p_owner AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CLIENT_OWNER_DENIED'; END IF;
 SELECT * INTO previous FROM public.client_import_batches WHERE owner_id=p_owner AND id=p_import_id;
 IF FOUND THEN
  IF previous.payload_hash<>p_hash THEN RAISE EXCEPTION 'CLIENT_IMPORT_ID_CONFLICT'; END IF;
  RETURN jsonb_build_object('count',previous.row_count,'duplicate',true);
 END IF;
 FOR entry IN SELECT j.value FROM jsonb_array_elements(p_rows) j LOOP
  IF jsonb_typeof(entry)<>'object' OR NOT entry?'name' THEN RAISE EXCEPTION 'CLIENT_CSV_INVALID'; END IF;
  FOR key,value IN SELECT e.key,e.value FROM jsonb_each_text(entry) e LOOP
   IF key NOT IN ('name','email','phone','address','address_number') OR (entry->key<>'null'::jsonb AND jsonb_typeof(entry->key)<>'string') THEN RAISE EXCEPTION 'CLIENT_CSV_INVALID'; END IF;
   IF value IS NOT NULL AND (length(value)>CASE key WHEN 'name' THEN 200 WHEN 'email' THEN 254 WHEN 'phone' THEN 50 WHEN 'address' THEN 500 ELSE 50 END OR regexp_replace(value,E'[\t\r\n]','','g') ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'CLIENT_CSV_INVALID'; END IF;
  END LOOP;
  IF coalesce(length(btrim(entry->>'name')),0)=0 THEN RAISE EXCEPTION 'CLIENT_CSV_INVALID'; END IF;
  IF nullif(entry->>'email','') IS NOT NULL AND entry->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RAISE EXCEPTION 'CLIENT_CSV_INVALID'; END IF;
  IF nullif(entry->>'phone','') IS NOT NULL AND length(regexp_replace(entry->>'phone','[^0-9]','','g')) NOT BETWEEN 3 AND 20 THEN RAISE EXCEPTION 'CLIENT_CSV_INVALID'; END IF;
 END LOOP;
 SELECT array_agg(DISTINCT lower(btrim(r.email))) FILTER(WHERE nullif(r.email,'') IS NOT NULL),
        array_agg(DISTINCT regexp_replace(r.phone,'[^0-9]','','g')) FILTER(WHERE nullif(r.phone,'') IS NOT NULL)
 INTO emails,phones FROM jsonb_to_recordset(p_rows) r(email text,phone text);
 signals:=public.client_csv_duplicates(p_owner,emails,phones);
 has_duplicates:=jsonb_array_length(signals->'emails')>0 OR jsonb_array_length(signals->'phones')>0
  OR EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows) r(email text) WHERE nullif(r.email,'') IS NOT NULL GROUP BY lower(btrim(r.email)) HAVING count(*)>1)
  OR EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows) r(phone text) WHERE nullif(r.phone,'') IS NOT NULL GROUP BY regexp_replace(r.phone,'[^0-9]','','g') HAVING count(*)>1);
 IF has_duplicates AND NOT p_allow_duplicates THEN RAISE EXCEPTION 'CLIENT_CSV_DUPLICATES'; END IF;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='clients' AND c.column_name='owner_id') THEN 'owner_id' ELSE 'gym_id' END INTO owner_column;
 PERFORM set_config('isipici.client_import','true',true);
 -- Typed records adapt to the deployed address_number type; any rejected cast rolls back everything.
 EXECUTE format('INSERT INTO public.clients(%I,name,email,phone,address,address_number,currency)
  SELECT $1,r.name,r.email,r.phone,r.address,r.address_number,$3 FROM jsonb_populate_recordset(NULL::public.clients,$2) r',owner_column)
 USING p_owner,p_rows,configured;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted<>n THEN RAISE EXCEPTION 'CLIENT_CSV_INVALID'; END IF;
 INSERT INTO public.client_import_batches(owner_id,id,payload_hash,row_count) VALUES(p_owner,p_import_id,p_hash,n);
 IF to_regclass('public.audit_events') IS NOT NULL AND to_regprocedure('public.emit_product_audit(uuid,text,text,uuid,jsonb)') IS NOT NULL THEN
  PERFORM public.emit_product_audit(p_owner,'client.imported','client',NULL,jsonb_build_object('count',n));
 END IF;
 PERFORM set_config('isipici.client_import','false',true);
 RETURN jsonb_build_object('count',n,'duplicate',false);
END $fn$;
REVOKE ALL ON FUNCTION public.import_clients_csv(uuid,uuid,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_clients_csv(uuid,uuid,text,jsonb,boolean) TO service_role;
COMMIT;
