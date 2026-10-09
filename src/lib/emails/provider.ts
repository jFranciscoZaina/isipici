import "server-only"
import { Resend } from "resend"

export function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error("Proveedor de email no configurado")
  return new Resend(key)
}
