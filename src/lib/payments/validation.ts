import { calendarDate, getRecurringPeriod, RECURRING_FREQUENCIES, FREQUENCY_LABELS, type RecurringFrequency } from "./schedule"
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
  try { return calendarDate(value) } catch { throw new PaymentError(`${label} inválida`) }
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
  if (source === "manual" && "currency" in b) throw new PaymentError("La moneda se configura desde administración")
  const currency = b.currency ?? "ARS"
  if (!(PAYMENT_PROVIDERS as readonly unknown[]).includes(provider) || source === "manual" && provider !== "manual") throw new PaymentError("Proveedor inválido para registro manual")
  if (!(PAYMENT_TYPES as readonly unknown[]).includes(paymentType)) throw new PaymentError("Tipo de pago inválido")
  if (!(CURRENCIES as readonly unknown[]).includes(currency)) throw new PaymentError("Moneda inválida")
  if (source === "manual" && ["providerPaymentId", "providerAccountId", "provider_payment_id", "payment_provider_account_id", "ownerId", "owner_id", "status", "nextPaymentDate", "next_payment_date", "billing_anchor_date", "interval_unit", "interval_count"].some(key => key in b)) throw new PaymentError("Identificadores de proveedor reservados al servidor")
  const concept = text(b.concept, "Concepto", 200)
  const frequency = b.frequency == null ? null : b.frequency
  if (frequency !== null && !(RECURRING_FREQUENCIES as readonly unknown[]).includes(frequency)) throw new PaymentError("Frecuencia inválida")
  const plan = text(b.plan, "Plan", 200) ?? (frequency ? FREQUENCY_LABELS[frequency as RecurringFrequency] : null)
  if (!concept && !plan) throw new PaymentError("Indicá un concepto o plan")
  let periodFrom = date(b.periodFrom, "Fecha desde")
  let periodTo = date(b.periodTo, "Fecha hasta")
  if (paymentType === "one_off" && periodFrom && !periodTo) periodTo = periodFrom
  if (Boolean(periodFrom) !== Boolean(periodTo) || periodFrom && periodTo && periodFrom > periodTo) throw new PaymentError("Rango de fechas inválido")
  const anchorDate = date(b.anchorDate, "Primer vencimiento")
  const cycleDate = date(b.cycleDate, "Vencimiento del ciclo") ?? anchorDate
  const debtPaymentId = b.debtPaymentId ? paymentId(b.debtPaymentId, "Pago de la deuda") : null
  if (paymentType === "one_off" && (b.recurringAgreementId || frequency || anchorDate || cycleDate || debtPaymentId)) throw new PaymentError("Un pago único no debe incluir recurrencia")
  if (debtPaymentId && (frequency || anchorDate || cycleDate || source !== "manual")) throw new PaymentError("Un pago de deuda no debe iniciar otro ciclo")
  let nextPaymentDate = paymentType === "recurring" ? periodTo : null
  if (frequency) {
    if (!anchorDate || !cycleDate || paymentType !== "recurring") throw new PaymentError("Seleccioná el primer vencimiento")
    try {
      const schedule = getRecurringPeriod({ frequency: frequency as RecurringFrequency, anchorDate, cycleDate })
      if (periodFrom && (periodFrom !== schedule.periodFrom || periodTo !== schedule.periodTo)) throw new Error("Período incompatible con la frecuencia")
      ;({ periodFrom, periodTo, nextPaymentDate } = schedule)
    } catch { throw new PaymentError("La fecha o el período no corresponden a esta recurrencia") }
  } else if (anchorDate || cycleDate) throw new PaymentError("Seleccioná una frecuencia")
  if (paymentType === "one_off" && b.debt != null && money(b.debt, "Deuda") !== 0) throw new PaymentError("Un pago único no modifica la deuda recurrente")
  const providerPaymentId = text(b.providerPaymentId, "ID de pago del proveedor", 200)
  const providerAccountId = b.providerAccountId ? paymentId(b.providerAccountId, "Cuenta") : null
  if (source === "provider" && (provider === "manual" || !providerPaymentId || !providerAccountId)) throw new PaymentError("Pago externo sin identificación confiable")
  return {
    clientId: paymentId(b.clientId, "Cliente"), provider: provider as PaymentInput["provider"], paymentType: paymentType as PaymentInput["paymentType"], currency: currency as PaymentInput["currency"],
    amount: money(b.amount, "Importe"), discount: money(b.discount, "Bonificación"),
    debt: paymentType === "one_off" ? null : money(b.debt, "Deuda"),
    plan, concept, serviceDate: date(b.serviceDate, "Fecha del servicio"), receiptNote: text(b.receiptNote, "Nota del comprobante", 1000), periodFrom, periodTo, nextPaymentDate,
    frequency: frequency as RecurringFrequency | null, anchorDate, cycleDate, debtPaymentId,
    recurringAgreementId: b.recurringAgreementId ? paymentId(b.recurringAgreementId, "Acuerdo") : null,
    providerAccountId, providerPaymentId,
  }
}
