import "server-only"
// Fachada compatible con los imports existentes; transporte y logs centralizados.
export { sendPaymentReceiptEmail, sendUpcomingDueEmail } from "./emails/service"

export { enqueuePaymentReceiptEmail } from "./emails/dispatch"
