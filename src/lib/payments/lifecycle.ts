import "server-only"
import { supabase } from "@/lib/supabaseClient"
import { ownedClientColumn } from "@/lib/auth"
import { PaymentError, paymentId } from "./validation"
import { calendarDate } from "./schedule"
import type { SubscriptionState, RecurringAgreementSummary, RecurringInstallment } from "./types"

export const LIFECYCLE_ACTIONS = ["create","pause","resume","cancel","change","adopt","archive","reactivate","waive","cancel_change","cancel_end","undo_cancel_end"] as const
export async function lifecycleOperation(ownerId: string, clientId: string, input: unknown) {
 paymentId(ownerId,"Cuenta");paymentId(clientId,"Cliente")
 if (!await ownedClientColumn(clientId,ownerId)) throw new PaymentError("Cliente no encontrado",404)
 if (!input || typeof input!=="object" || Array.isArray(input)) throw new PaymentError("Acción inválida")
 const b=input as Record<string,unknown>
 if (Object.keys(b).some(key=>!["action","agreementId","installmentId","frequency","anchorDate","amount","nextDueDate","planName","planId","effectiveFrom","replaceChangeId","changeId"].includes(key))) throw new PaymentError("Campos no permitidos")
 const action=b.action
 if (!(LIFECYCLE_ACTIONS as readonly unknown[]).includes(action)) throw new PaymentError("Acción inválida")
 const normalized: Record<string,unknown>={}
 if (["pause","resume","cancel","change","adopt","cancel_change","cancel_end","undo_cancel_end"].includes(String(action))) normalized.agreementId=paymentId(b.agreementId,"Suscripción")
 if(b.planId!=null)normalized.planId=paymentId(b.planId,"Plan")
 if(b.replaceChangeId!=null)normalized.replaceChangeId=paymentId(b.replaceChangeId,"Cambio")
 if(action==="cancel_change")normalized.changeId=paymentId(b.changeId,"Cambio")
 if (["create","change"].includes(String(action))) {
  if(!normalized.planId)throw new PaymentError("Seleccioná un plan del catálogo");
  try{normalized.anchorDate=calendarDate(String(b.effectiveFrom??b.anchorDate))}catch{throw new PaymentError("Fecha inválida")}
  if(action==="change")normalized.effectiveFrom=normalized.anchorDate
 }
 if (["resume","adopt"].includes(String(action))) { try { normalized.nextDueDate=calendarDate(String(b.nextDueDate)) } catch { throw new PaymentError("Próximo vencimiento inválido") } }
 const result=action==="waive" ? await supabase.rpc("waive_recurring_installment",{p_owner:ownerId,p_client:clientId,p_installment:paymentId(b.installmentId,"Cuota")}) : await supabase.rpc("subscription_lifecycle",{p_owner:ownerId,p_client:clientId,p_action:action,p_input:normalized})
 if(result.error?.message==="PLAN_EFFECTIVE_DATE_PROTECTED")throw new PaymentError("La fecha debe ser posterior al último período pagado, parcial o vencido",409)
 if (result.error) throw new PaymentError(result.error.message==="PAYMENT_OWNER_DENIED"||result.error.message==="PAYMENT_AGREEMENT_DENIED" ? "Cliente o suscripción no disponible" : "No se pudo completar la acción. Revisá estado y vencimiento de la suscripción",409)
 return result.data??{ok:true}
}
export async function getSubscriptionState(ownerId: string,clientId: string, visible?: {from:string;to:string}): Promise<SubscriptionState> {
 paymentId(clientId,"Cliente")
 const column=await ownedClientColumn(clientId,ownerId)
 if (!column) throw new PaymentError("Cliente no encontrado",404)
 // Ownership is checked before these independent reads; do not cache across requests.
 const [ownerResult, clientResult] = await Promise.all([
  supabase.from("owners").select("id").eq("id",ownerId).eq("is_active",true).single(),
  supabase.from("clients").select("archived_at,current_debt,legacy_debt_amount").eq("id",clientId).eq(column,ownerId).single(),
 ])
 const {data:owner,error:ownerError}=ownerResult
 const {data:client,error:clientError}=clientResult
 if (ownerError||!owner) throw new PaymentError("Cuenta no disponible",401)
 if (clientError||!client) throw new PaymentError("Cliente no disponible",503)
 if(visible){
  try{calendarDate(visible.from);calendarDate(visible.to)}catch{throw new PaymentError("Rango de calendario inválido")}
  const calendar=await supabase.rpc("recurring_calendar",{p_owner:ownerId,p_client:clientId,p_from:visible.from,p_to:visible.to})
  const [agreements,legacy]=await Promise.all([
   supabase.from("recurring_agreements").select("id,plan_id,cancel_at_period_end,cancellation_boundary,plan_name,amount,currency,provider,interval_unit,interval_count,billing_anchor_date,next_charge_at,status,installments_enabled").eq("owner_id",ownerId).eq("client_id",clientId).order("created_at",{ascending:false}),
   supabase.from("payments").select("id,debt").eq("owner_id",ownerId).eq("client_id",clientId).is("recurring_installment_id",null).is("allocation_selection",null).or("payment_type.eq.recurring,payment_type.is.null").order("created_at",{ascending:false}).limit(1),
  ])
  if(calendar.error||agreements.error||legacy.error)throw new PaymentError("No se pudo obtener la agenda. Revisá que la migración 16 esté aplicada y el rango no supere seis meses",503)
  const {data:changes,error:changeError}=await supabase.from("subscription_changes").select("id,recurring_agreement_id,target_plan_id,new_plan_name,new_amount,currency,new_frequency,effective_from,starts_on,status").eq("owner_id",ownerId).eq("client_id",clientId).eq("status","scheduled")
  if(changeError)throw new PaymentError("No se pudo consultar el cambio programado",503)
  const all=(agreements.data??[]) as RecurringAgreementSummary[]
  return {scheduledChange:changes?.[0]??null,current:all.find(a=>["pending","active","paused"].includes(a.status))??null,agreements:all,installments:calendar.data.installments,editEffectiveDate:calendar.data.editEffectiveDate,archivedAt:client.archived_at,legacyDebt:Number(client.legacy_debt_amount??client.current_debt??0),legacyDebtPaymentId:legacy.data?.[0]?.debt>0?legacy.data[0].id:null}
 }
 const through=new Date(Date.now()+5*86400000).toISOString().slice(0,10)
 const {error:ensureError}=await supabase.rpc("ensure_recurring_installments_through",{p_owner:ownerId,p_client:clientId,p_through:through})
 if (ensureError) throw new PaymentError("No se pudo actualizar la agenda",503)
 // Read after agenda generation so next_charge_at and installments agree.
 const [agreementResult, installmentResult, legacyResult] = await Promise.all([
  supabase.from("recurring_agreements").select("id,plan_id,cancel_at_period_end,cancellation_boundary,plan_name,amount,currency,provider,interval_unit,interval_count,billing_anchor_date,next_charge_at,status,installments_enabled").eq("owner_id",ownerId).eq("client_id",clientId).order("created_at",{ascending:false}),
  supabase.from("recurring_installments").select("id,recurring_agreement_id,due_date,period_from,period_to,amount_due,currency,status,payments(id,amount,discount),payment_allocations(payment_id,amount_applied,discount_applied)").eq("owner_id",ownerId).eq("client_id",clientId).eq("payments.owner_id",ownerId).eq("payment_allocations.owner_id",ownerId).order("due_date",{ascending:true}),
  supabase.from("payments").select("id,debt").eq("owner_id",ownerId).eq("client_id",clientId).is("recurring_installment_id",null).is("allocation_selection",null).or("payment_type.eq.recurring,payment_type.is.null").order("created_at",{ascending:false}).limit(1),
 ])
 const {data:agreements,error:agreementError}=agreementResult
 const {data:installments,error:installmentError}=installmentResult
 const {data:legacy,error:legacyError}=legacyResult
 if (agreementError||installmentError||legacyError) throw new PaymentError("No se pudo obtener la suscripción",503)
 // ensure already refreshes active modern subscriptions. Paused/archived debt still ages.
 if ((agreements??[]).some(a=>a.installments_enabled) && (client.archived_at || !(agreements??[]).some(a=>a.status==="active"&&a.installments_enabled))) {
  const {error}=await supabase.rpc("refresh_installment_snapshot",{p_owner:ownerId,p_client:clientId})
  if(error)throw new PaymentError("No se pudo actualizar la deuda",503)
 }
 const today=new Date().toISOString().slice(0,10)
 const rows=(installments??[]).map(row=>{
  const allocations=row.payment_allocations as {payment_id:string;amount_applied:number;discount_applied:number}[]??[]
  const allocated=new Set(allocations.map(a=>a.payment_id))
  const covered=(allocations.reduce((sum,a)=>sum+Math.round((Number(a.amount_applied)+Number(a.discount_applied))*100),0)+(row.payments as {id:string;amount:number;discount:number}[]??[]).filter(p=>!allocated.has(p.id)).reduce((sum,p)=>sum+Math.round((Number(p.amount)+Number(p.discount))*100),0))/100
  const remaining=row.status==="open"?Math.max(Math.round((Number(row.amount_due)-covered)*100)/100,0):0
  return {...row,payments:undefined,payment_allocations:undefined,covered_amount:covered,remaining,overdue:row.status==="open"&&remaining>0&&row.due_date<today,partially_paid:row.status==="open"&&covered>0&&remaining>0} as RecurringInstallment
 })
 const all=(agreements??[]) as RecurringAgreementSummary[]
 return {current:all.find(a=>["pending","active","paused"].includes(a.status))??null,agreements:all,installments:rows,archivedAt:client.archived_at,legacyDebt:Number(client.legacy_debt_amount??client.current_debt??0),legacyDebtPaymentId:legacy?.[0]?.debt>0?legacy[0].id:null}
}
