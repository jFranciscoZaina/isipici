import "server-only"
import { supabase } from "@/lib/supabaseClient"
import { ownedClientColumn } from "@/lib/auth"
import { sendPaymentReceiptEmail, enqueuePaymentReceiptEmail } from "@/lib/email"
import { parsePayment, paymentId, PaymentError } from "./validation"
import {receiptAllocations} from "./receipts"
import type { CanonicalPayment } from "./types"

export async function processPaymentReceipt(ownerId:string,payment:CanonicalPayment,queueReceipt=false){
  let receiptStatus="not_sent"
  let receiptJobId:string|undefined
  try{
    const ownerColumn=await ownedClientColumn(payment.client_id,ownerId)
    if(!ownerColumn)return {receiptStatus,receiptJobId}
    const {data:client,error:clientError}=await supabase.from("clients").select("name, email, next_payment_date").eq("id",payment.client_id).eq(ownerColumn,ownerId).single()
    if(!clientError&&client?.email){
      const {data:owner}=await supabase.from("owners").select("name").eq("id",ownerId).single()
      const allocations=payment.recurring_agreement_id?await receiptAllocations(ownerId,payment.id):[]
      const receiptInput={allocations,
        ownerId,clientId:payment.client_id,deduplicationKey:`payment-receipt:${ownerId}:${payment.id}`,
        to:client.email,clientName:client.name??"Cliente",ownerName:owner?.name??"Tu negocio",
        amount:payment.amount,currency:payment.currency,dueDate:payment.payment_type==="one_off"?null:payment.recurring_agreement_id?client.next_payment_date:payment.next_payment_date,
        paymentType:payment.payment_type??"recurring" as const,paymentDate:payment.created_at,
        periodFrom:payment.period_from,periodTo:payment.period_to,
        plan:payment.plan,concept:payment.concept,serviceDate:payment.service_date,
        receiptNote:payment.receipt_note,remainingDebt:payment.debt,
      }
      const queued=queueReceipt?await enqueuePaymentReceiptEmail(receiptInput,payment.id):null
      if(queued&&!queued.legacySchema){receiptStatus=queued.status;receiptJobId=queued.jobId}
      else{
        const email=await sendPaymentReceiptEmail(receiptInput)
        receiptStatus=email.loggingError?"pending":email.status
      }
    }
  }catch{receiptStatus="failed"}
  return {receiptStatus,receiptJobId}
}

async function register(ownerId: string, input: unknown, source: "manual" | "provider", queueReceipt = false) {
  paymentId(ownerId, "Cuenta propietaria")
  const paymentInput = parsePayment(input, source)
  const ownerColumn = await ownedClientColumn(paymentInput.clientId, ownerId)
  if (!ownerColumn) throw new PaymentError("Cliente no encontrado", 404)
  const { data: configuredOwner, error: ownerError } = await supabase.from("owners").select("default_currency").eq("id", ownerId).eq("is_active", true).single()
  if (ownerError || !configuredOwner || !["ARS", "AUD"].includes(configuredOwner.default_currency)) throw new PaymentError("Configuración de moneda no disponible", 503)
  if (source === "provider" && paymentInput.currency !== configuredOwner.default_currency) throw new PaymentError("La moneda del proveedor no coincide con la cuenta", 409)
  paymentInput.currency = configuredOwner.default_currency
  const { data, error } = await supabase.rpc("register_canonical_payment", { p_owner_id: ownerId, p_input: paymentInput })
  if (error || !data) {
    const code = error?.message
    if (["PAYMENT_OWNER_DENIED", "PAYMENT_AGREEMENT_DENIED", "PAYMENT_ACCOUNT_DENIED"].includes(code ?? "")) throw new PaymentError("Cliente, acuerdo o cuenta no disponible", 404)
    if (code === "CLIENT_ARCHIVED") throw new PaymentError("Cliente dado de baja: solo puede pagar deuda existente", 409)
    if(code==="OLDER_INSTALLMENTS_REQUIRED")throw new PaymentError("Incluí primero las cuotas pendientes anteriores",409)
    if (code === "INSTALLMENT_OVERALLOCATION") throw new PaymentError("El pago y descuento superan el saldo pendiente de la cuota", 409)
    if (code === "PAYMENT_INSTALLMENT_DENIED") throw new PaymentError("Cuota no disponible para este cliente", 404)
    if (code?.startsWith("REVIEW_REQUIRED") || code === "CURRENT_AGREEMENT_EXISTS") throw new PaymentError("Revisá la suscripción existente antes de registrar otra cuota", 409)
    if (code === "PAYMENT_CURRENCY_CONFLICT") throw new PaymentError("La moneda debe coincidir con la configuración de la cuenta", 409)
    if (["PAYMENT_SCHEDULE_CONFLICT", "PAYMENT_ANCHOR_IMMUTABLE"].includes(code ?? "")) throw new PaymentError("El vencimiento o la frecuencia no coinciden con la recurrencia existente", 409)
    if (code === "PAYMENT_INPUT_INVALID") throw new PaymentError("Datos de pago o período inválidos", 400)
    if (code === "PAYMENT_ID_CONFLICT") throw new PaymentError("Identificador de pago ya utilizado con otros datos", 409)
    throw new PaymentError("No se pudo registrar el pago", 503)
  }
  const result = data as { payment: CanonicalPayment; duplicate: boolean }
  if (!result.payment?.id || typeof result.duplicate !== "boolean") throw new PaymentError("Respuesta de pago inválida", 503)
  const {receiptStatus,receiptJobId}=await processPaymentReceipt(ownerId,result.payment,queueReceipt)
  return { ...result, receiptStatus, receiptJobId }
}
export function registerManualPayment(ownerId: string, input: unknown, options?: { queueReceipt: boolean }) { return register(ownerId, input, "manual", options?.queueReceipt ?? false) }
// Solo servidor: después de verificar el proveedor y resolver el owner desde nuestra DB.
// No acepta pending/failed como pagos del ledger ni se expone por HTTP en este hito.
export function registerConfirmedProviderPayment(ownerId: string, input: unknown, outcome: "paid") {
  if (outcome !== "paid") throw new PaymentError("Solo pagos confirmados pueden ingresar al ledger")
  return register(ownerId, input, "provider")
}
