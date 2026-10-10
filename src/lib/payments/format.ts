import type { Currency } from "./types"
const formatters = new Map<Currency, Intl.NumberFormat>()
export function formatPaymentMoney(amount: number, currency: Currency = "ARS"): string {
  let formatter = formatters.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat(currency === "AUD" ? "en-AU" : "es-AR", {
      style: "currency", currency, currencyDisplay: currency === "AUD" ? "code" : "symbol", minimumFractionDigits: 2,
    })
    formatters.set(currency, formatter)
  }
  return formatter.format(amount)
}
