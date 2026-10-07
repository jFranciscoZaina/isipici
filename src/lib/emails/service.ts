import "server-only"
import { createHash } from "node:crypto"
import { supabase } from "@/lib/supabaseClient"
import { ownedClientColumn } from "@/lib/auth"
import { getResend } from "./provider"
import { renderPaymentReceipt, type ReceiptTemplateInput } from "./templates/payment-receipt"
import { renderUpcomingPayment, type ReminderTemplateInput } from "./templates/upcoming-payment"

type Context = { ownerId: string; clientId: string; deduplicationKey: string }
export type EmailResult = {
  provider: "resend"; providerEmailId: string | null; logId: string | null
  status: "sent" | "failed" | "pending" | "already_recorded"
  deliveryStatus?: string
  error?: { code: string; message: string }
  loggingError?: boolean
}

async function send(input: Context & { to: string; dueDate: string | null }, type: string, template: { subject: string; html: string }): Promise<EmailResult> {
  const base = { provider: "resend" as const, providerEmailId: null, logId: null }
  try {
    if (!await ownedClientColumn(input.clientId, input.ownerId)) return { ...base, status: "failed", error: { code: "ownership", message: "Cliente no disponible" } }
    const key = createHash("sha256").update(input.deduplicationKey).digest("hex")
    const { data: log, error: logError } = await supabase.from("email_logs").insert({
      owner_id: input.ownerId, client_id: input.clientId, type, recipient_email: input.to,
      subject: template.subject, due_date: input.dueDate, provider: "resend",
      deduplication_key: key, status: "sent", delivery_status: "pending", sent_at: null,
    }).select("id").single()
    if (logError?.code === "23505") {
      const { data, error } = await supabase.from("email_logs").select("id, provider_email_id, delivery_status").eq("deduplication_key", key).eq("owner_id", input.ownerId).eq("client_id", input.clientId).maybeSingle()
      if (error || !data) return { ...base, status: "failed", loggingError: true, error: { code: "log", message: "No se pudo consultar el envío" } }
      return { ...base, providerEmailId: data.provider_email_id, logId: data.id, status: "already_recorded", deliveryStatus: data.delivery_status }
    }
    if (logError || !log) return { ...base, status: "failed", loggingError: true, error: { code: "log", message: "No se pudo registrar el envío" } }
    let providerEmailId: string | null = null
    let failure: EmailResult["error"]
    try {
      const from = process.env.EMAIL_FROM
      if (!from || !process.env.RESEND_API_KEY) failure = { code: "configuration", message: "Proveedor de email no configurado" }
      else {
        const result = await getResend().emails.send({ from, to: input.to, ...template }, { idempotencyKey: `isipici/${key}` })
        providerEmailId = result.data?.id ?? null
        if (result.error || !providerEmailId) failure = { code: result.error?.name ?? "provider", message: "El proveedor no confirmó el envío" }
      }
    } catch { failure = { code: "transport", message: "No se pudo confirmar el envío al proveedor" } }
    const now = new Date().toISOString()
    const status = failure?.code === "transport" ? "pending" : failure ? "failed" : "sent"
    const { error: updateError } = await supabase.from("email_logs").update({
      provider_email_id: providerEmailId, status: failure ? "failed" : "sent",
      delivery_status: status, sent_at: failure ? null : now,
      failed_at: status === "failed" ? now : null, error_details: failure ?? null, updated_at: now,
    }).eq("id", log.id).eq("owner_id", input.ownerId)
    let loggingError = Boolean(updateError)
    if (providerEmailId && !updateError) {
      const { error } = await supabase.rpc("reconcile_resend_email", { p_email_id: providerEmailId })
      loggingError ||= Boolean(error)
    }
    return { provider: "resend", providerEmailId, logId: log.id, status, deliveryStatus: status, ...(failure ? { error: failure } : {}), ...(loggingError ? { loggingError } : {}) }
  } catch { return { ...base, status: "failed", loggingError: true, error: { code: "service", message: "Servicio de email no disponible" } } }
}

export function sendPaymentReceiptEmail(input: ReceiptTemplateInput & Context) {
  return send(input, "payment_receipt", renderPaymentReceipt(input))
}
export function sendUpcomingDueEmail(input: ReminderTemplateInput & Context) {
  return send(input, "upcoming_due", renderUpcomingPayment(input))
}
