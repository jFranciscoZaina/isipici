import "server-only"
import { setTimeout as delay } from "node:timers/promises"
import {receiptAllocations} from "@/lib/payments/receipts"
import type { CanonicalPayment } from "@/lib/payments/types"
import type { CreateEmailRequestOptions } from "resend"
import { supabase } from "@/lib/supabaseClient"
import { getResend } from "./provider"
import { renderPaymentReceipt, type ReceiptTemplateInput } from "./templates/payment-receipt"

type ReceiptContext = { ownerId: string; clientId: string; deduplicationKey: string }
type QueueResult = { status: "queued" | "pending" | "already_recorded" | "failed"; jobId?: string; legacySchema?: boolean }
type Job = { id: string; owner_id: string; deduplication_key: string; dispatch_token: string; dispatch_payload: { from: string; to: string; subject: string; html: string } }
export async function enqueuePaymentReceiptEmail(input: ReceiptTemplateInput & ReceiptContext, paymentId: string): Promise<QueueResult> {
 if (!process.env.EMAIL_FROM || !process.env.RESEND_API_KEY) return { status: "failed" }
 const payload = { from: process.env.EMAIL_FROM, to: input.to, ...renderPaymentReceipt(input) }
 const { data, error } = await supabase.rpc("enqueue_payment_receipt", { p_owner: input.ownerId, p_payment: paymentId, p_payload: payload, p_due: input.dueDate })
 if (error) return { status: "failed", legacySchema: error.code === "PGRST202" || error.code === "42883" }
 if (!data?.id) return { status: "failed" }
 return { status: ["queued", "processing"].includes(data.state) ? "queued" : data.state === "review" ? "pending" : data.state === "failed" ? "failed" : "already_recorded", ...(data.state === "queued" ? { jobId: data.id } : {}) }
}

// Persisted lease and token prevent two workers from sending the same job concurrently.
async function dispatchOne(id: string | null, ownerId: string | null): Promise<"empty" | "sent" | "pending" | "failed"> {
 const { data, error } = await supabase.rpc("claim_email_dispatch", { p_id: id, p_owner: ownerId })
 if (error) throw new Error("No se pudo consultar la cola de emails")
 const job = (data as Job[] | null)?.[0]
 if (!job) return "empty"
 let providerId: string | null = null
 let retry = true
 let failure: { code: string; message: string } | null = null
 try {
  if (!process.env.RESEND_API_KEY) { retry = false; failure = { code: "configuration", message: "Proveedor de email no configurado" } }
  else {
   // The installed SDK forwards RequestInit options through post(). No naked promise.
   const options: CreateEmailRequestOptions & { signal: AbortSignal } = { idempotencyKey: `isipici/${job.deduplication_key}`, signal: AbortSignal.timeout(15000) }
   const result = await getResend().emails.send(job.dispatch_payload, options)
   providerId = result.data?.id ?? null
   if (!providerId) {
    const code = result.error?.name ?? "transport"
    retry = !["validation_error", "missing_api_key", "invalid_api_key", "restricted_api_key", "invalid_access", "invalid_parameter", "not_found", "invalid_region"].includes(code)
    failure = { code, message: "El proveedor no confirmó el envío" }
   }
  }
 } catch { failure = { code: "transport", message: "No se pudo confirmar el envío al proveedor" } }
 const finished = await supabase.rpc("finish_email_dispatch", { p_id: job.id, p_token: job.dispatch_token, p_provider_id: providerId, p_retry: retry, p_error: failure })
 if (finished.error || finished.data !== true) return "pending"
 if (providerId) {
  const reconciliation = await supabase.rpc("reconcile_resend_email", { p_email_id: providerId })
  if (reconciliation.error) return "pending"
  return "sent"
 }
 return retry ? "pending" : "failed"
}
export async function dispatchEmailJob(id: string, ownerId: string, retryOnce = false) {
 const status=await dispatchOne(id,ownerId)
 if(retryOnce && status==="pending") {
  // One short retry after the HTTP response; a lease remains recoverable if execution stops.
  await delay(5500)
  const retry=await dispatchOne(id,ownerId)
  return retry==="empty"?status:retry
 }
 return status
}
type RecoveryReceipt = { payment: CanonicalPayment; clientName: string; to: string; nextDue: string | null; ownerName: string | null }
export async function recoverUnqueuedReceipts() {
 const {data,error}=await supabase.rpc("unqueued_payment_receipts",{p_limit:3})
 if(error)throw new Error("No se pudo consultar comprobantes pendientes")
 let queued=0
 for(const row of (data??[]) as RecoveryReceipt[]) {
  const p=row.payment
  const result=await enqueuePaymentReceiptEmail({allocations:p.recurring_agreement_id?await receiptAllocations(p.owner_id,p.id):[],ownerId:p.owner_id,clientId:p.client_id,deduplicationKey:`payment-receipt:${p.owner_id}:${p.id}`,to:row.to,clientName:row.clientName??"Cliente",ownerName:row.ownerName??"Tu negocio",amount:p.amount,currency:p.currency,paymentType:p.payment_type??"recurring",paymentDate:p.created_at,dueDate:p.payment_type==="one_off"?null:p.recurring_agreement_id?row.nextDue:p.next_payment_date,periodFrom:p.period_from,periodTo:p.period_to,plan:p.plan,concept:p.concept,serviceDate:p.service_date,receiptNote:p.receipt_note,remainingDebt:p.debt},p.id)
  if(result.status==="queued")queued++
 }
 return queued
}
export async function drainEmailQueue() {
 await recoverUnqueuedReceipts()
 const results: string[] = []
 // Bound provider work; persisted leases survive a platform deadline or DB timeout.
 for (let index = 0; index < 3; index++) {
  const status = await dispatchOne(null, null)
  if (status === "empty") break
  results.push(status)
 }
 return { processed: results.length, sent: results.filter(status => status === "sent").length, pending: results.filter(status => status === "pending").length, failed: results.filter(status => status === "failed").length }
}
