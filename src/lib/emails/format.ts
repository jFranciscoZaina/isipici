export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!)
}
import { formatPaymentMoney } from "../payments/format"
export const formatMoney = formatPaymentMoney
export function formatDate(value: string): string {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value)
  return Number.isNaN(date.getTime()) ? "fecha no disponible" : date.toLocaleDateString("es-AR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" })
}
