-- Manual después de 20261014. Cola en email_logs; los pagos confirmados no se modifican.
BEGIN;
-- Existing payments stay NULL; only future inserts carry a durable receipt intent.
ALTER TABLE public.payments ADD COLUMN receipt_requested_at timestamptz;
ALTER TABLE public.payments ALTER COLUMN receipt_requested_at SET DEFAULT now();
CREATE INDEX payment_receipt_recovery_idx ON public.payments(receipt_requested_at) WHERE receipt_requested_at IS NOT NULL;
ALTER TABLE public.email_logs
 ADD COLUMN dispatch_payload jsonb,
 ADD COLUMN dispatch_state text CHECK (dispatch_state IN ('queued','processing','sent','failed','review')),
 ADD COLUMN dispatch_attempts integer NOT NULL DEFAULT 0 CHECK (dispatch_attempts>=0),
 ADD COLUMN dispatch_available_at timestamptz,
 ADD COLUMN dispatch_first_attempt_at timestamptz,
 ADD COLUMN dispatch_lease_until timestamptz,
 ADD COLUMN dispatch_token uuid;
CREATE INDEX email_dispatch_ready_idx ON public.email_logs(dispatch_available_at,created_at) WHERE dispatch_state IN ('queued','processing');
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_logs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.email_logs TO service_role;
CREATE FUNCTION public.enqueue_payment_receipt(p_owner uuid,p_payment uuid,p_payload jsonb,p_due date)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.payments%ROWTYPE; c public.clients%ROWTYPE; log public.email_logs%ROWTYPE; key text;
BEGIN
 SELECT * INTO p FROM public.payments WHERE id=p_payment AND owner_id=p_owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_OWNER_DENIED'; END IF;
 SELECT * INTO c FROM public.clients WHERE id=p.client_id;
 IF coalesce(to_jsonb(c)->>'owner_id',to_jsonb(c)->>'gym_id') IS DISTINCT FROM p_owner::text OR NOT EXISTS(SELECT 1 FROM public.owners WHERE id=p_owner AND is_active=true) THEN RAISE EXCEPTION 'PAYMENT_OWNER_DENIED'; END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR NOT (p_payload ?& ARRAY['from','to','subject','html']) OR (p_payload-ARRAY['from','to','subject','html'])<>'{}'::jsonb
  OR p_payload->>'to' IS DISTINCT FROM c.email OR coalesce(length(p_payload->>'from'),0)=0 OR coalesce(length(p_payload->>'subject'),0)=0 OR coalesce(length(p_payload->>'html'),0) NOT BETWEEN 1 AND 200000 THEN RAISE EXCEPTION 'EMAIL_QUEUE_INVALID'; END IF;
 key:=encode(sha256(convert_to('payment-receipt:'||p_owner::text||':'||p.id::text,'UTF8')),'hex');
 INSERT INTO public.email_logs(owner_id,client_id,type,recipient_email,subject,due_date,provider,deduplication_key,status,delivery_status,sent_at,dispatch_payload,dispatch_state,dispatch_available_at)
 VALUES(p_owner,p.client_id,'payment_receipt',c.email,p_payload->>'subject',p_due,'resend',key,'sent','pending',NULL,p_payload,'queued',now())
 ON CONFLICT(deduplication_key) WHERE deduplication_key IS NOT NULL DO NOTHING;
 SELECT * INTO log FROM public.email_logs WHERE deduplication_key=key AND owner_id=p_owner AND client_id=p.client_id;
 RETURN jsonb_build_object('id',log.id,'state',log.dispatch_state,'providerEmailId',log.provider_email_id);
END $$;
CREATE FUNCTION public.claim_email_dispatch(p_id uuid DEFAULT NULL,p_owner uuid DEFAULT NULL)
RETURNS SETOF public.email_logs LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF (p_id IS NULL)<>(p_owner IS NULL) THEN RAISE EXCEPTION 'EMAIL_QUEUE_INVALID'; END IF;
 -- Provider idempotency expires after 24h: ambiguous old attempts require manual review.
 UPDATE public.email_logs e SET dispatch_state='review',dispatch_lease_until=NULL,dispatch_token=NULL,
  error_details=jsonb_build_object('code','retry_review','message','Revisar el envío antes de reintentar'),updated_at=now()
 WHERE (p_id IS NULL OR (e.id=p_id AND e.owner_id=p_owner)) AND e.dispatch_state IN ('queued','processing') AND e.provider_email_id IS NULL
  AND (e.dispatch_first_attempt_at<now()-interval '23 hours' OR (e.dispatch_attempts>=5 AND coalesce(e.dispatch_lease_until,'-infinity')<=now()));
 RETURN QUERY WITH candidate AS (
  SELECT e.id FROM public.email_logs e JOIN public.owners o ON o.id=e.owner_id AND o.is_active=true
  JOIN public.clients c ON c.id=e.client_id AND coalesce(to_jsonb(c)->>'owner_id',to_jsonb(c)->>'gym_id')=e.owner_id::text
  WHERE (p_id IS NULL OR (e.id=p_id AND e.owner_id=p_owner)) AND e.provider_email_id IS NULL AND e.dispatch_payload IS NOT NULL
   AND ((e.dispatch_state='queued' AND e.dispatch_available_at<=now()) OR (e.dispatch_state='processing' AND e.dispatch_lease_until<=now())) AND e.dispatch_attempts<5
   AND (e.dispatch_first_attempt_at IS NULL OR e.dispatch_first_attempt_at>=now()-interval '23 hours')
  ORDER BY e.dispatch_available_at,e.created_at,e.id LIMIT 1 FOR UPDATE OF e SKIP LOCKED
 ) UPDATE public.email_logs e SET dispatch_state='processing',dispatch_attempts=e.dispatch_attempts+1,
  dispatch_first_attempt_at=coalesce(e.dispatch_first_attempt_at,now()),dispatch_lease_until=now()+interval '2 minutes',dispatch_token=gen_random_uuid(),updated_at=now()
 FROM candidate WHERE e.id=candidate.id RETURNING e.*;
END $$;
CREATE FUNCTION public.finish_email_dispatch(p_id uuid,p_token uuid,p_provider_id text,p_retry boolean,p_error jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE log public.email_logs%ROWTYPE;
BEGIN
 SELECT * INTO log FROM public.email_logs WHERE id=p_id AND dispatch_state='processing' AND dispatch_token=p_token FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.email_logs SET
  provider_email_id=p_provider_id,
  dispatch_state=CASE WHEN p_provider_id IS NOT NULL THEN 'sent' WHEN p_retry AND log.dispatch_attempts<5 THEN 'queued' WHEN p_retry THEN 'review' ELSE 'failed' END,
  dispatch_available_at=now()+least(3600,5*power(2,log.dispatch_attempts-1)) * interval '1 second',dispatch_lease_until=NULL,dispatch_token=NULL,
  status=CASE WHEN p_provider_id IS NOT NULL OR p_retry THEN 'sent' ELSE 'failed' END,
  delivery_status=CASE WHEN p_provider_id IS NOT NULL THEN 'sent' WHEN p_retry THEN 'pending' ELSE 'failed' END,
  sent_at=CASE WHEN p_provider_id IS NOT NULL THEN now() ELSE NULL END,
  failed_at=CASE WHEN p_provider_id IS NULL AND NOT p_retry THEN now() ELSE NULL END,error_details=p_error,updated_at=now()
 WHERE id=p_id;
 RETURN true;
END $$;
CREATE FUNCTION public.unqueued_payment_receipts(p_limit integer DEFAULT 3)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(row.payload),'[]'::jsonb) FROM (
  SELECT jsonb_build_object('payment',to_jsonb(p),'clientName',c.name,'to',c.email,'nextDue',c.next_payment_date,'ownerName',o.name) payload
  FROM public.payments p JOIN public.owners o ON o.id=p.owner_id AND o.is_active=true
  JOIN public.clients c ON c.id=p.client_id AND coalesce(to_jsonb(c)->>'owner_id',to_jsonb(c)->>'gym_id')=p.owner_id::text
  WHERE p.receipt_requested_at IS NOT NULL AND p.receipt_requested_at>=now()-interval '7 days' AND p.created_at>=p.receipt_requested_at-interval '5 minutes' AND c.email IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.email_logs e WHERE e.deduplication_key=encode(sha256(convert_to('payment-receipt:'||p.owner_id::text||':'||p.id::text,'UTF8')),'hex'))
  ORDER BY p.receipt_requested_at,p.id LIMIT least(greatest(p_limit,1),10)
 ) row;
$$;
REVOKE ALL ON FUNCTION public.unqueued_payment_receipts(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.unqueued_payment_receipts(integer) TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_payment_receipt(uuid,uuid,jsonb,date),public.claim_email_dispatch(uuid,uuid),public.finish_email_dispatch(uuid,uuid,text,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_payment_receipt(uuid,uuid,jsonb,date),public.claim_email_dispatch(uuid,uuid),public.finish_email_dispatch(uuid,uuid,text,boolean,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
