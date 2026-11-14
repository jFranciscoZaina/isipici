-- M26. Editable events + event payment dates. Apply manually AFTER M25.
BEGIN;

CREATE OR REPLACE FUNCTION public.event_update(
 p_owner_id uuid,
 p_event_id uuid,
 p_name text,
 p_description text,
 p_starts_at timestamptz,
 p_ends_at timestamptz,
 p_location text,
 p_capacity integer
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path=''
AS $fn$
DECLARE
 event_row public.business_events%ROWTYPE;
 active_people integer;
BEGIN
 IF p_name IS NULL
  OR length(btrim(p_name)) NOT BETWEEN 1 AND 200
  OR p_starts_at IS NULL
  OR (p_ends_at IS NOT NULL AND p_ends_at<p_starts_at)
  OR (p_description IS NOT NULL AND length(p_description)>2000)
  OR (p_location IS NOT NULL AND length(p_location)>300)
  OR (p_capacity IS NOT NULL AND p_capacity<=0)
 THEN
  RAISE EXCEPTION 'EVENT_INPUT_INVALID';
 END IF;

 SELECT * INTO event_row
 FROM public.business_events
 WHERE id=p_event_id
  AND owner_id=p_owner_id
 FOR UPDATE;

 IF NOT FOUND OR event_row.status IN ('cancelled','completed')
 THEN
  RAISE EXCEPTION 'EVENT_UNAVAILABLE';
 END IF;

 SELECT count(*)
 INTO active_people
 FROM public.event_participants
 WHERE event_id=p_event_id
  AND owner_id=p_owner_id
  AND status<>'cancelled';

 IF p_capacity IS NOT NULL AND p_capacity<active_people
 THEN
  RAISE EXCEPTION 'EVENT_CAPACITY_BELOW_CURRENT';
 END IF;

 UPDATE public.business_events
 SET
  name=btrim(p_name),
  description=nullif(btrim(coalesce(p_description,'')),''),
  starts_at=p_starts_at,
  ends_at=p_ends_at,
  location=nullif(btrim(coalesce(p_location,'')),''),
  capacity=p_capacity,
  updated_at=clock_timestamp()
 WHERE id=p_event_id
  AND owner_id=p_owner_id
 RETURNING * INTO event_row;

 -- Paid event payments keep their event context aligned after an edit.
 UPDATE public.payments p
 SET
  concept=event_row.name,
  plan=event_row.name,
  service_date=(event_row.starts_at AT TIME ZONE event_row.timezone)::date
 WHERE p.owner_id=p_owner_id
  AND p.id IN (
   SELECT ep.payment_id
   FROM public.event_participants ep
   WHERE ep.owner_id=p_owner_id
    AND ep.event_id=p_event_id
    AND ep.status='paid'
    AND ep.payment_id IS NOT NULL
  );

 RETURN to_jsonb(event_row);
END
$fn$;

CREATE OR REPLACE FUNCTION public.event_register_participant_payment_v2(
 p_owner_id uuid,
 p_participant_id uuid,
 p_payment_date date DEFAULT NULL,
 p_receipt_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path=''
AS $fn$
DECLARE
 participant public.event_participants%ROWTYPE;
 event_row public.business_events%ROWTYPE;
 payment_result jsonb;
 payment_row public.payments%ROWTYPE;
 service_day date;
 today_local date;
 effective_payment_date date;
 payment_timestamp timestamptz;
 latest_amount numeric;
 latest_date date;
BEGIN
 SELECT * INTO participant
 FROM public.event_participants
 WHERE id=p_participant_id
  AND owner_id=p_owner_id
 FOR UPDATE;

 IF NOT FOUND THEN
  RAISE EXCEPTION 'EVENT_PARTICIPANT_UNAVAILABLE';
 END IF;

 IF participant.status='paid' AND participant.payment_id IS NOT NULL THEN
  SELECT * INTO payment_row
  FROM public.payments
  WHERE id=participant.payment_id
   AND owner_id=p_owner_id;

  RETURN jsonb_build_object(
   'payment',to_jsonb(payment_row),
   'participant',to_jsonb(participant),
   'duplicate',true
  );
 END IF;

 IF participant.status<>'pending' THEN
  RAISE EXCEPTION 'EVENT_PARTICIPANT_UNAVAILABLE';
 END IF;

 SELECT * INTO event_row
 FROM public.business_events
 WHERE id=participant.event_id
  AND owner_id=p_owner_id
 FOR SHARE;

 IF NOT FOUND OR event_row.status IN ('cancelled','completed') THEN
  RAISE EXCEPTION 'EVENT_UNAVAILABLE';
 END IF;

 today_local:=(clock_timestamp() AT TIME ZONE event_row.timezone)::date;
 effective_payment_date:=coalesce(p_payment_date,today_local);

 IF effective_payment_date>today_local THEN
  RAISE EXCEPTION 'EVENT_PAYMENT_DATE_FUTURE';
 END IF;

 service_day:=(event_row.starts_at AT TIME ZONE event_row.timezone)::date;

 payment_result:=public.register_canonical_payment(
  p_owner_id,
  jsonb_build_object(
   'clientId',participant.client_id,
   'provider','manual',
   'paymentType','one_off',
   'currency',participant.currency,
   'amount',participant.amount_due,
   'discount',0,
   'debt',0,
   'concept',event_row.name,
   'serviceDate',service_day,
   'receiptNote',nullif(btrim(p_receipt_note),'')
  )
 );

 IF effective_payment_date=today_local THEN
  payment_timestamp:=clock_timestamp();
 ELSE
  payment_timestamp:=(effective_payment_date + time '12:00') AT TIME ZONE event_row.timezone;
 END IF;

 UPDATE public.payments
 SET created_at=payment_timestamp
 WHERE id=(payment_result->'payment'->>'id')::uuid
  AND owner_id=p_owner_id
  AND client_id=participant.client_id;

 SELECT * INTO payment_row
 FROM public.payments
 WHERE id=(payment_result->'payment'->>'id')::uuid
  AND owner_id=p_owner_id
  AND client_id=participant.client_id;

 IF NOT FOUND THEN
  RAISE EXCEPTION 'EVENT_PAYMENT_DENIED';
 END IF;

 UPDATE public.event_participants
 SET
  status='paid',
  payment_id=payment_row.id,
  paid_at=payment_timestamp
 WHERE id=participant.id
 RETURNING * INTO participant;

 SELECT
  p.amount,
  (p.created_at AT TIME ZONE event_row.timezone)::date
 INTO latest_amount,latest_date
 FROM public.payments p
 WHERE p.owner_id=p_owner_id
  AND p.client_id=participant.client_id
 ORDER BY p.created_at DESC,p.id DESC
 LIMIT 1;

 UPDATE public.clients
 SET
  last_payment_amount=latest_amount,
  last_payment_date=latest_date
 WHERE id=participant.client_id;

 RETURN jsonb_build_object(
  'payment',to_jsonb(payment_row),
  'participant',to_jsonb(participant),
  'duplicate',coalesce((payment_result->>'duplicate')::boolean,false)
 );
END
$fn$;

REVOKE ALL ON FUNCTION public.event_update(
 uuid,uuid,text,text,timestamptz,timestamptz,text,integer
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.event_update(
 uuid,uuid,text,text,timestamptz,timestamptz,text,integer
) TO service_role;

REVOKE ALL ON FUNCTION public.event_register_participant_payment_v2(
 uuid,uuid,date,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.event_register_participant_payment_v2(
 uuid,uuid,date,text
) TO service_role;

NOTIFY pgrst,'reload schema';

COMMIT;
