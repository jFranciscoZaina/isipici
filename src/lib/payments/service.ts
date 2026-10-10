import "server-only"
import { supabase } from "@/lib/supabaseClient"
import { ownedClientColumn } from "@/lib/auth"
import { sendPaymentReceiptEmail } from "@/lib/email"
import { parsePayment, paymentId, PaymentError } from "./validation"
import type { CanonicalPayment } from "./types"

async function register(ownerId: string, input: unknown, source: "manual" | "provider") {
  paymentId(ownerId, "Cuenta propietaria")
  const paymentInput = parsePayment(input, source)
  const ownerColumn = await ownedClientColumn(paymentInput.clientId, ownerId)
  if (!ownerColumn) throw new PaymentError("Cliente no encontrado", 404)
  const { data, error } = await supabase.rpc("register_canonical_payment", { p_owner_id: ownerId, p_input: paymentInput })
  if (error || !data) {
    const code = error?.message
    if (["PAYMENT_OWNER_DENIED", "PAYMENT_AGREEMENT_DENIED", "PAYMENT_ACCOUNT_DENIED"].includes(code ?? "")) throw new PaymentError("Cliente, acuerdo o cuenta no disponible", 404)
    if (code === "PAYMENT_CURRENCY_CONFLICT") throw new PaymentError("La moneda debe coincidir con los pagos y la deuda del cliente", 409)
    if (code === "PAYMENT_ID_CONFLICT") throw new PaymentError("Identificador de pago ya utilizado con otros datos", 409)
    throw new PaymentError("No se pudo registrar el pago", 503)
  }
  const result = data as { payment: CanonicalPayment; duplicate: boolean }
  if (!result.payment?.id || typeof result.duplicate !== "boolean") throw new PaymentError("Respuesta de pago inválida", 503)
  // Pago y snapshot confirmados. Ningún fallo de email cambia ese resultado.
  let receiptStatus = "not_sent"
  try {
    const { data: client, error: clientError } = await supabase.from("clients").select("name, email").eq("id", result.payment.client_id).eq(ownerColumn, ownerId).single()
    if (!clientError && client?.email) {
      const { data: owner } = await supabase.from("owners").select("name").eq("id", ownerId).single()
      const email = await sendPaymentReceiptEmail({
        ownerId, clientId: result.payment.client_id, deduplicationKey: `payment-receipt:${ownerId}:${result.payment.id}`,
        to: client.email, clientName: client.name ?? "Cliente", ownerName: owner?.name ?? "Tu negocio",
        amount: result.payment.amount, currency: result.payment.currency, dueDate: result.payment.period_to,
        plan: result.payment.plan, concept: result.payment.concept, serviceDate: result.payment.service_date,
        receiptNote: result.payment.receipt_note, remainingDebt: result.payment.debt,
      })
      receiptStatus = email.loggingError ? "pending" : email.status
    }
  } catch { receiptStatus = "failed" }
  return { ...result, receiptStatus }
}
export function registerManualPayment(ownerId: string, input: unknown) { return register(ownerId, input, "manual") }
// Solo servidor: después de verificar el proveedor y resolver el owner desde nuestra DB.
// No acepta pending/failed como pagos del ledger ni se expone por HTTP en este hito.
export function registerConfirmedProviderPayment(ownerId: string, input: unknown, outcome: "paid") {
  if (outcome !== "paid") throw new PaymentError("Solo pagos confirmados pueden ingresar al ledger")
  return register(ownerId, input, "provider")
}
