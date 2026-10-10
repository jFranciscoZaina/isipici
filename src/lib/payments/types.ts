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
  periodFrom: string | null; periodTo: string | null
  recurringAgreementId: string | null; providerAccountId: string | null; providerPaymentId: string | null
}
export type CanonicalPayment = {
  id: string; owner_id: string; client_id: string; amount: number; discount: number; debt: number
  plan: string | null; provider: PaymentProvider; currency: Currency; payment_type: PaymentType | null
  concept: string | null; service_date: string | null; receipt_note: string | null
  period_from: string | null; period_to: string | null; next_payment_date: string | null
  recurring_agreement_id: string | null; created_at: string
}
// Los futuros adapters de servidor normalizarán eventos después de verificar su firma.
export type ProviderAction =
  | { kind: "charge_paid"; paymentType: PaymentType; payment: PaymentInput }
  | { kind: "charge_pending" | "charge_failed"; provider: PaymentProvider; providerPaymentId: string }
  | { kind: "agreement_status"; provider: PaymentProvider; providerAgreementId: string; status: RecurringAgreementStatus }
  | { kind: "authorization_revoked"; provider: PaymentProvider; providerAccountId: string }
