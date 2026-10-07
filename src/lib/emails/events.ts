import "server-only"
import { supabase } from "@/lib/supabaseClient"

export const eventTypes = ["email.sent", "email.delivered", "email.delivery_delayed", "email.bounced", "email.complained", "email.failed", "email.opened", "email.clicked"] as const
export type TrackedEvent = typeof eventTypes[number]
export async function processResendEvent(eventId: string, input: unknown) {
  const event = input as { type?: unknown; created_at?: unknown; data?: { email_id?: unknown; bounce?: unknown; failed?: unknown } } | null
  if (!event || typeof event.type !== "string") throw new Error("Evento inválido")
  if (!(eventTypes as readonly string[]).includes(event.type)) return { ignored: true }
  if (typeof event.data?.email_id !== "string" || event.data.email_id.length > 200 || typeof event.created_at !== "string" || !Number.isFinite(Date.parse(event.created_at))) throw new Error("Evento inválido")
  // Solo detalles de fallo; nunca confiar en owner_id/client_id, URLs o destinatarios del payload.
  const raw = event.data.bounce ?? event.data.failed
  const details: Record<string, string> = {}
  if (raw && typeof raw === "object") for (const key of ["message", "type", "subType", "reason"]) {
    const value = (raw as Record<string, unknown>)[key]
    if (typeof value === "string") details[key] = value.slice(0, 500)
  }
  const { data, error } = await supabase.rpc("record_resend_event", {
    p_event_id: eventId, p_email_id: event.data.email_id, p_type: event.type,
    p_occurred_at: event.created_at, p_details: Object.keys(details).length ? details : null,
  })
  if (error) throw new Error("No se pudo persistir el evento")
  return { duplicate: data === false }
}
