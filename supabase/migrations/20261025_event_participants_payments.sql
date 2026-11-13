-- M25. Event participants + canonical payment linkage. Apply manually AFTER M24.
BEGIN;

DO $migration$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname='business_events_id_owner_unique'
   AND conrelid='public.business_events'::regclass
 ) THEN
  ALTER TABLE public.business_events
   ADD CONSTRAINT business_events_id_owner_unique UNIQUE(id,owner_id);
 END IF;

 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname='payments_id_owner_client_unique'
   AND conrelid='public.payments'::regclass
 ) THEN
  ALTER TABLE public.payments
   ADD CONSTRAINT payments_id_owner_client_unique UNIQUE(id,owner_id,client_id);
 END IF;
END
$migration$;

CREATE TABLE IF NOT EXISTS public.event_participants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
 event_id uuid NOT NULL,
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
 amount_due numeric(14,2) NOT NULL,
 currency text NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 payment_id uuid,
 paid_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT event_participants_event_owner_fk
  FOREIGN KEY(event_id,owner_id)
  REFERENCES public.business_events(id,owner_id)
  ON DELETE CASCADE,
 CONSTRAINT event_participants_payment_context_fk
  FOREIGN KEY(payment_id,owner_id,client_id)
  REFERENCES public.payments(id,owner_id,client_id)
  ON DELETE RESTRICT,
 CONSTRAINT event_participants_event_client_unique UNIQUE(event_id,client_id),
 CONSTRAINT event_participants_payment_unique UNIQUE(payment_id),
 CONSTRAINT event_participants_amount_valid CHECK (
  amount_due>0 AND amount_due<=1e12 AND amount_due=round(amount_due,2)
 ),
 CONSTRAINT event_participants_currency_valid CHECK (currency IN ('ARS','AUD')),
 CONSTRAINT event_participants_status_valid CHECK (status IN ('pending','paid','cancelled')),
 CONSTRAINT event_participants_payment_state_valid CHECK (
  (status='paid' AND payment_id IS NOT NULL AND paid_at IS NOT NULL)
  OR (status IN ('pending','cancelled') AND payment_id IS NULL AND paid_at IS NULL)
 )
);

CREATE INDEX IF NOT EXISTS event_participants_owner_event_status_idx
 ON public.event_participants(owner_id,event_id,status);

ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_participants FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.event_participants TO service_role;

CREATE OR REPLACE FUNCTION public.guard_event_participant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $fn$
DECLARE
 e public.business_events%ROWTYPE;
 c public.clients%ROWTYPE;
 p public.payments%ROWTYPE;
 owner_currency text;
 used_capacity integer;
BEGIN
 SELECT * INTO e
 FROM public.business_events
 WHERE id=NEW.event_id AND owner_id=NEW.owner_id
 FOR SHARE;

 IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_UNAVAILABLE'; END IF;

 SELECT * INTO c
 FROM public.clients
 WHERE id=NEW.client_id
 FOR SHARE;

 IF NOT FOUND
  OR coalesce(to_jsonb(c)->>'owner_id',to_jsonb(c)->>'gym_id')
     IS DISTINCT FROM NEW.owner_id::text
 THEN
  RAISE EXCEPTION 'EVENT_CLIENT_DENIED';
 END IF;

 IF to_jsonb(c)->>'archived_at' IS NOT NULL
  AND to_jsonb(c)->>'archived_at'<>''
 THEN
  RAISE EXCEPTION 'EVENT_CLIENT_ARCHIVED';
 END IF;

 SELECT default_currency
 INTO owner_currency
 FROM public.owners
 WHERE id=NEW.owner_id AND is_active=true;

 IF NOT FOUND OR NEW.currency IS DISTINCT FROM owner_currency
 THEN
  RAISE EXCEPTION 'EVENT_CURRENCY_CONFLICT';
 END IF;

 IF TG_OP='UPDATE'
  AND OLD.status='paid'
  AND (
   NEW.event_id<>OLD.event_id
   OR NEW.client_id<>OLD.client_id
   OR NEW.amount_due<>OLD.amount_due
   OR NEW.currency<>OLD.currency
   OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
   OR NEW.status<>OLD.status
  )
 THEN
  RAISE EXCEPTION 'EVENT_PARTICIPANT_PAID_IMMUTABLE';
 END IF;

 IF NEW.status<>'cancelled' AND e.capacity IS NOT NULL THEN
  SELECT count(*)
  INTO used_capacity
  FROM public.event_participants ep
  WHERE ep.event_id=NEW.event_id
   AND ep.owner_id=NEW.owner_id
   AND ep.status<>'cancelled'
   AND (TG_OP='INSERT' OR ep.id<>NEW.id);

  IF used_capacity>=e.capacity THEN
   RAISE EXCEPTION 'EVENT_CAPACITY_REACHED';
  END IF;
 END IF;

 IF NEW.payment_id IS NOT NULL THEN
  SELECT * INTO p
  FROM public.payments
  WHERE id=NEW.payment_id
   AND owner_id=NEW.owner_id
   AND client_id=NEW.client_id
  FOR SHARE;

  IF NOT FOUND
   OR p.payment_type IS DISTINCT FROM 'one_off'
   OR p.amount<>NEW.amount_due
   OR p.currency<>NEW.currency
  THEN
   RAISE EXCEPTION 'EVENT_PAYMENT_DENIED';
  END IF;
 END IF;

 RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS event_participant_guard ON public.event_participants;
CREATE TRIGGER event_participant_guard
 BEFORE INSERT OR UPDATE ON public.event_participants
 FOR EACH ROW EXECUTE FUNCTION public.guard_event_participant();

CREATE OR REPLACE FUNCTION public.event_participant_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $fn$
BEGIN
 NEW.updated_at:=clock_timestamp();
 RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS event_participant_updated_at_trigger ON public.event_participants;
CREATE TRIGGER event_participant_updated_at_trigger
 BEFORE UPDATE ON public.event_participants
 FOR EACH ROW EXECUTE FUNCTION public.event_participant_updated_at();

CREATE OR REPLACE FUNCTION public.event_add_participant(
 p_owner_id uuid,
 p_event_id uuid,
 p_client_id uuid,
 p_amount_due numeric
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path=''
AS $fn$
DECLARE
 e public.business_events%ROWTYPE;
 c public.clients%ROWTYPE;
 participant public.event_participants%ROWTYPE;
 owner_currency text;
BEGIN
 IF p_amount_due IS NULL
  OR p_amount_due<=0
  OR p_amount_due>1e12
  OR p_amount_due<>round(p_amount_due,2)
 THEN
  RAISE EXCEPTION 'EVENT_INPUT_INVALID';
 END IF;

 SELECT * INTO e
 FROM public.business_events
 WHERE id=p_event_id
  AND owner_id=p_owner_id
 FOR UPDATE;

 IF NOT FOUND OR e.status IN ('cancelled','completed')
 THEN
  RAISE EXCEPTION 'EVENT_UNAVAILABLE';
 END IF;

 SELECT * INTO c
 FROM public.clients
 WHERE id=p_client_id
 FOR SHARE;

 IF NOT FOUND
  OR coalesce(to_jsonb(c)->>'owner_id',to_jsonb(c)->>'gym_id')
     IS DISTINCT FROM p_owner_id::text
 THEN
  RAISE EXCEPTION 'EVENT_CLIENT_DENIED';
 END IF;

 IF to_jsonb(c)->>'archived_at' IS NOT NULL
  AND to_jsonb(c)->>'archived_at'<>''
 THEN
  RAISE EXCEPTION 'EVENT_CLIENT_ARCHIVED';
 END IF;

 SELECT default_currency INTO owner_currency
 FROM public.owners
 WHERE id=p_owner_id AND is_active=true;

 IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_UNAVAILABLE'; END IF;

 SELECT * INTO participant
 FROM public.event_participants
 WHERE event_id=p_event_id
  AND client_id=p_client_id
 FOR UPDATE;

 IF FOUND THEN
  IF participant.status<>'cancelled'
  THEN
   RAISE EXCEPTION 'EVENT_PARTICIPANT_EXISTS';
  END IF;

  UPDATE public.event_participants
  SET
   amount_due=p_amount_due,
   currency=owner_currency,
   status='pending',
   payment_id=NULL,
   paid_at=NULL
  WHERE id=participant.id
  RETURNING * INTO participant;
 ELSE
  INSERT INTO public.event_participants(
   owner_id,event_id,client_id,amount_due,currency,status
  ) VALUES (
   p_owner_id,p_event_id,p_client_id,p_amount_due,owner_currency,'pending'
  )
  RETURNING * INTO participant;
 END IF;

 RETURN to_jsonb(participant);
END
$fn$;

CREATE OR REPLACE FUNCTION public.event_cancel_participant(
 p_owner_id uuid,
 p_participant_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path=''
AS $fn$
DECLARE participant public.event_participants%ROWTYPE;
BEGIN
 SELECT * INTO participant
 FROM public.event_participants
 WHERE id=p_participant_id
  AND owner_id=p_owner_id
 FOR UPDATE;

 IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_PARTICIPANT_UNAVAILABLE'; END IF;
 IF participant.status='paid' THEN RAISE EXCEPTION 'EVENT_PARTICIPANT_PAID_IMMUTABLE'; END IF;

 UPDATE public.event_participants
 SET status='cancelled'
 WHERE id=participant.id
 RETURNING * INTO participant;

 RETURN to_jsonb(participant);
END
$fn$;

CREATE OR REPLACE FUNCTION public.event_register_participant_payment(
 p_owner_id uuid,
 p_participant_id uuid,
 p_receipt_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path=''
AS $fn$
DECLARE
 participant public.event_participants%ROWTYPE;
 e public.business_events%ROWTYPE;
 payment_result jsonb;
 payment_row public.payments%ROWTYPE;
 service_day date;
BEGIN
 SELECT * INTO participant
 FROM public.event_participants
 WHERE id=p_participant_id
  AND owner_id=p_owner_id
 FOR UPDATE;

 IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_PARTICIPANT_UNAVAILABLE'; END IF;

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

 IF participant.status<>'pending'
 THEN
  RAISE EXCEPTION 'EVENT_PARTICIPANT_UNAVAILABLE';
 END IF;

 SELECT * INTO e
 FROM public.business_events
 WHERE id=participant.event_id
  AND owner_id=p_owner_id
 FOR SHARE;

 IF NOT FOUND OR e.status IN ('cancelled','completed')
 THEN
  RAISE EXCEPTION 'EVENT_UNAVAILABLE';
 END IF;

 service_day:=(e.starts_at AT TIME ZONE e.timezone)::date;

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
   'concept',e.name,
   'serviceDate',service_day,
   'receiptNote',nullif(btrim(p_receipt_note),'')
  )
 );

 SELECT * INTO payment_row
 FROM public.payments
 WHERE id=(payment_result->'payment'->>'id')::uuid
  AND owner_id=p_owner_id
  AND client_id=participant.client_id;

 IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_PAYMENT_DENIED'; END IF;

 UPDATE public.event_participants
 SET
  status='paid',
  payment_id=payment_row.id,
  paid_at=clock_timestamp()
 WHERE id=participant.id
 RETURNING * INTO participant;

 RETURN jsonb_build_object(
  'payment',to_jsonb(payment_row),
  'participant',to_jsonb(participant),
  'duplicate',coalesce((payment_result->>'duplicate')::boolean,false)
 );
END
$fn$;

DO $permissions$
DECLARE f record;
BEGIN
 FOR f IN
  SELECT p.oid::regprocedure signature
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
   AND p.proname IN (
    'guard_event_participant',
    'event_participant_updated_at',
    'event_add_participant',
    'event_cancel_participant',
    'event_register_participant_payment'
   )
 LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.signature||' TO service_role';
 END LOOP;
END
$permissions$;

NOTIFY pgrst,'reload schema';

COMMIT;
