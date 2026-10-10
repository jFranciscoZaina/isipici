import type { RecurringFrequency } from "./schedule"
export const PAYMENT_PROVIDERS = ["manual", "stripe", "mercadopago"] as const
export const PAYMENT_TYPES = ["recurring", "one_off"] as const
export const CURRENCIES = ["ARS", "AUD"] as const
export type PaymentProvider = typeof PAYMENT_PROVIDERS[number]
export type PaymentType = typeof PAYMENT_TYPES[number]
export type Currency = typeof CURRENCIES[number]
export type RecurringAgreementStatus = "pending" | "active" | "paused" | "cancelled" | "failed"
export type ProviderConnectionStatus = "disconnected" | "pending" | "connected" | "restricted"
export type PaymentInput = {
  clientId: string; provider: PaymentProvider; paymentType: PaymentType; currency: Currency
  amount: number; discount: number; debt: number | null; plan: string | null
  concept: string | null; serviceDate: string | null; receiptNote: string | null
  periodFrom: string | null; periodTo: string | null; nextPaymentDate: string | null
  selectedInstallmentIds?: string[]; recurringInstallmentId: string | null; frequency: RecurringFrequency | null; anchorDate: string | null; cycleDate: string | null; debtPaymentId: string | null
  recurringAgreementId: string | null; providerAccountId: string | null; providerPaymentId: string | null
}
export type RecurringAgreementSummary = {
  id: string; plan_name?: string | null; amount: number; currency: Currency; provider: PaymentProvider; installments_enabled: boolean; interval_unit: string; interval_count: number; billing_anchor_date: string | null; next_charge_at: string | null; status: RecurringAgreementStatus
}
export type CanonicalPayment = {
  id: string; owner_id: string; client_id: string; amount: number; discount: number; debt: number
  plan: string | null; provider: PaymentProvider; currency: Currency; payment_type: PaymentType | null
  concept: string | null; service_date: string | null; receipt_note: string | null
  period_from: string | null; period_to: string | null; next_payment_date: string | null
  recurring_agreement_id: string | null; recurring_installment_id: string | null; created_at: string
}
// Los futuros adapters de servidor normalizarán eventos después de verificar su firma.
export type ProviderAction =
  | { kind: "charge_paid"; paymentType: PaymentType; payment: PaymentInput }
  | { kind: "charge_pending" | "charge_failed"; provider: PaymentProvider; providerPaymentId: string }
  | { kind: "agreement_status"; provider: PaymentProvider; providerAgreementId: string; status: RecurringAgreementStatus }
  | { kind: "authorization_revoked"; provider: PaymentProvider; providerAccountId: string }

export type RecurringInstallment = {
 id: string; recurring_agreement_id: string; due_date: string; period_from: string; period_to: string; amount_due: number; currency: Currency;
 status: "open" | "paid" | "waived" | "cancelled"; covered_amount: number; remaining: number; overdue: boolean; partially_paid: boolean
}
export type ReceiptAllocation = {periodFrom:string;periodTo:string;amountApplied:number;discountApplied:number;remaining:number}
export type SubscriptionState = { editEffectiveDate?: string; current: RecurringAgreementSummary | null; agreements: RecurringAgreementSummary[]; installments: RecurringInstallment[]; archivedAt: string | null; legacyDebt: number; legacyDebtPaymentId: string | null }
