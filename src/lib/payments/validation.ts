import { CURRENCIES, PAYMENT_PROVIDERS, PAYMENT_TYPES, type PaymentInput } from "./types"

export class PaymentError extends Error {
  constructor(message: string, public readonly status = 400) { super(message) }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function paymentId(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new PaymentError(`${label} inválido`)
  return value
}
function text(value: unknown, label: string, max: number): string | null {
  if (value == null || value === "") return null
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new PaymentError(`${label}: máximo ${max} caracteres, sin caracteres de control`)
  return value.trim() || null
}
function date(value: unknown, label: string): string | null {
  if (value == null || value === "") return null
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01") throw new PaymentError(`${label} inválida`)
  const parsed = new Date(`${value}T12:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new PaymentError(`${label} inválida`)
  return value
}
function money(value: unknown, label: string): number {
  const n = value == null || value === "" ? 0 : typeof value === "number" || typeof value === "string" && /^\d+(\.\d{1,2})?$/.test(value) ? Number(value) : NaN
  if (!Number.isFinite(n) || n < 0 || n > 1e12 || !/^\d+(\.\d{1,2})?$/.test(String(n))) throw new PaymentError(`${label} inválido (hasta dos decimales)`)
  return n
}
export function parsePayment(input: unknown, source: "manual" | "provider" = "manual"): PaymentInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new PaymentError("Datos de pago inválidos")
  const b = input as Record<string, unknown>
  const provider = b.provider ?? "manual"
  const paymentType = b.paymentType ?? "recurring"
  const currency = b.currency ?? "ARS"
  if (!(PAYMENT_PROVIDERS as readonly unknown[]).includes(provider) || source === "manual" && provider !== "manual") throw new PaymentError("Proveedor inválido para registro manual")
  if (!(PAYMENT_TYPES as readonly unknown[]).includes(paymentType)) throw new PaymentError("Tipo de pago inválido")
  if (!(CURRENCIES as readonly unknown[]).includes(currency)) throw new PaymentError("Moneda inválida")
  if (source === "manual" && ["providerPaymentId", "providerAccountId", "provider_payment_id", "payment_provider_account_id", "ownerId", "owner_id", "status"].some(key => key in b)) throw new PaymentError("Identificadores de proveedor reservados al servidor")
  const concept = text(b.concept, "Concepto", 200)
  const plan = text(b.plan, "Plan", 200)
  if (!concept && !plan) throw new PaymentError("Indicá un concepto o plan")
  const periodFrom = date(b.periodFrom, "Fecha desde")
  const periodTo = date(b.periodTo, "Fecha hasta")
  if (Boolean(periodFrom) !== Boolean(periodTo) || periodFrom && periodTo && periodFrom > periodTo) throw new PaymentError("Rango de fechas inválido")
  if (paymentType === "one_off" && (periodFrom || b.recurringAgreementId)) throw new PaymentError("Un pago único no debe incluir período ni acuerdo recurrente")
  const providerPaymentId = text(b.providerPaymentId, "ID de pago del proveedor", 200)
  const providerAccountId = b.providerAccountId ? paymentId(b.providerAccountId, "Cuenta") : null
  if (source === "provider" && (provider === "manual" || !providerPaymentId || !providerAccountId)) throw new PaymentError("Pago externo sin identificación confiable")
  return {
    clientId: paymentId(b.clientId, "Cliente"), provider: provider as PaymentInput["provider"], paymentType: paymentType as PaymentInput["paymentType"], currency: currency as PaymentInput["currency"],
    amount: money(b.amount, "Importe"), discount: money(b.discount, "Bonificación"),
    debt: b.debt == null && paymentType === "one_off" ? null : money(b.debt, "Deuda"),
    plan, concept, serviceDate: date(b.serviceDate, "Fecha del servicio"), receiptNote: text(b.receiptNote, "Nota del comprobante", 1000), periodFrom, periodTo,
    recurringAgreementId: b.recurringAgreementId ? paymentId(b.recurringAgreementId, "Acuerdo") : null,
    providerAccountId, providerPaymentId,
  }
}
