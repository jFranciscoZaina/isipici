import { NextRequest, NextResponse } from "next/server"
import { getResend } from "@/lib/emails/provider"
import { processResendEvent } from "@/lib/emails/events"

export const runtime = "nodejs"
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: "Webhook no configurado" }, { status: 503 })
  const id = req.headers.get("svix-id")
  const timestamp = req.headers.get("svix-timestamp")
  const signature = req.headers.get("svix-signature")
  if (!id || id.length > 200 || !timestamp || !signature) return NextResponse.json({ error: "Firma inválida" }, { status: 401 })
  const payload = await req.text()
  if (Buffer.byteLength(payload) > 256000) return NextResponse.json({ error: "Payload demasiado grande" }, { status: 413 })
  let event: unknown
  try { event = getResend().webhooks.verify({ payload, headers: { id, timestamp, signature }, webhookSecret: secret }) }
  catch { return NextResponse.json({ error: "Firma inválida" }, { status: 401 }) }
  try { return NextResponse.json({ ok: true, ...await processResendEvent(id, event) }) }
  catch { return NextResponse.json({ error: "Evento no procesado" }, { status: 503 }) }
}
