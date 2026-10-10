import type { Currency } from "./types"
export function formatPaymentMoney(amount: number, currency: Currency = "ARS"): string {
  return new Intl.NumberFormat(currency === "AUD" ? "en-AU" : "es-AR", {
    style: "currency", currency, currencyDisplay: currency === "AUD" ? "code" : "symbol", minimumFractionDigits: 2,
  }).format(amount)
}
