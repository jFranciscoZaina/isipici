-- Manual, después de 20261013. Solo lectura agregada e índices; sin backfill ni cambio de ledger.
BEGIN;
CREATE INDEX IF NOT EXISTS payments_owner_client_created_idx ON public.payments(owner_id,client_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS payments_owner_client_recurring_created_idx ON public.payments(owner_id,client_id,created_at DESC,id DESC) WHERE payment_type IS DISTINCT FROM 'one_off';
CREATE INDEX IF NOT EXISTS email_logs_owner_client_created_idx ON public.email_logs(owner_id,client_id,created_at DESC);
CREATE FUNCTION public.dashboard_client_summary(p_owner uuid,p_archived boolean,p_month_start timestamptz,p_month_end timestamptz,p_today date)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE currency text; owner_column text; result jsonb;
BEGIN
 SELECT default_currency INTO currency FROM public.owners WHERE id=p_owner AND is_active=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_OWNER_DENIED'; END IF;
 IF p_month_start IS NULL OR p_month_end IS NULL OR p_month_end<=p_month_start OR p_month_end>p_month_start+interval '32 days' OR p_today IS NULL THEN RAISE EXCEPTION 'PAYMENT_INPUT_INVALID'; END IF;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='owner_id') THEN 'owner_id' ELSE 'gym_id' END INTO owner_column;
 -- Column name comes exclusively from this allowlist, never from an HTTP request.
 EXECUTE format($query$
 WITH selected AS MATERIALIZED (
  SELECT c.id,c.name,c.email,c.phone,c.address,c.address_number,c.created_at,c.current_debt,c.archived_at,c.legacy_debt_amount,c.next_payment_date FROM public.clients c WHERE c.%I=$1 AND (c.archived_at IS NOT NULL)=$5
 ), monthly AS (
  SELECT p.client_id,sum(p.amount) total FROM public.payments p JOIN selected c ON c.id=p.client_id
  WHERE p.owner_id=$1 AND p.currency=$6 AND p.created_at >= $2 AND p.created_at < $3 GROUP BY p.client_id
 ), balances AS (
  SELECT i.client_id,sum(greatest(i.amount_due-coalesce(covered.total,0),0)) debt
  FROM public.recurring_installments i JOIN selected c ON c.id=i.client_id
  LEFT JOIN LATERAL (SELECT sum(coalesce(p.amount,0)+coalesce(p.discount,0)) total FROM public.payments p WHERE p.recurring_installment_id=i.id AND p.owner_id=$1 AND p.client_id=i.client_id) covered ON true
  WHERE i.owner_id=$1 AND i.status='open' AND i.due_date<=$4 GROUP BY i.client_id
 ), agreement_states AS (
  SELECT a.client_id,bool_or(a.status='active') active FROM public.recurring_agreements a JOIN selected c ON c.id=a.client_id WHERE a.owner_id=$1 GROUP BY a.client_id
 )
 SELECT coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
  'last_payment',to_jsonb(last_payment),'last_recurring',to_jsonb(last_recurring),
  'total_paid_this_month',coalesce(m.total,0),'installment_debt',coalesce(b.debt,0),
  'has_agreements',a.client_id IS NOT NULL,'has_active_agreement',coalesce(a.active,false)
 ) ORDER BY c.created_at,c.id),'[]'::jsonb)
 FROM selected c
 LEFT JOIN LATERAL (SELECT p.id,p.created_at FROM public.payments p WHERE p.owner_id=$1 AND p.client_id=c.id ORDER BY p.created_at DESC,p.id DESC LIMIT 1) last_payment ON true
 LEFT JOIN LATERAL (SELECT p.id,p.created_at,p.plan,p.debt,p.next_payment_date,p.period_to FROM public.payments p WHERE p.owner_id=$1 AND p.client_id=c.id AND p.payment_type IS DISTINCT FROM 'one_off' ORDER BY p.created_at DESC,p.id DESC LIMIT 1) last_recurring ON true
 LEFT JOIN monthly m ON m.client_id=c.id LEFT JOIN balances b ON b.client_id=c.id LEFT JOIN agreement_states a ON a.client_id=c.id
 $query$,owner_column) INTO result USING p_owner,p_month_start,p_month_end,p_today,p_archived,currency;
 RETURN jsonb_build_object('currency',currency,'clients',result);
END $$;
REVOKE ALL ON FUNCTION public.dashboard_client_summary(uuid,boolean,timestamptz,timestamptz,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_client_summary(uuid,boolean,timestamptz,timestamptz,date) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
