import "server-only"
import { NextRequest, NextResponse, after } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import { sendUpcomingDueEmail } from "./service"
import { legacyReminderEligible, sendInstallmentReminders } from "./installment-reminders"

type Candidate = { id: string; name: string; email: string; owner_id?: string; gym_id?: string; current_debt: number | null }
const missingColumn = (code?: string) => code === "42703" || code === "PGRST204"

async function candidates(target: string, legacy: boolean, canonicalExists: boolean) {
  const rows: Candidate[] = []
  let ownerColumn = "owner_id"
  for (let offset = 0; ; offset += 100) {
    const query = () => {
      let builder = supabase.from("clients").select(`id, name, email, ${ownerColumn}, current_debt`).eq(legacy ? "next_due" : "next_payment_date", target).is("archived_at", null).not("email", "is", null).order("id").range(offset, offset + 99)
      if (legacy && canonicalExists) builder = builder.is("next_payment_date", null)
      return builder
    }
    let result = await query()
    if (missingColumn(result.error?.code) && ownerColumn === "owner_id") { ownerColumn = "gym_id"; result = await query() }
    if (missingColumn(result.error?.code)) return { rows: [], exists: false }
    if (result.error) throw new Error("No se pudieron consultar los recordatorios")
    const batch = (result.data ?? []) as unknown as Candidate[]
    rows.push(...batch)
    if (batch.length < 100) break
  }
  return { rows, exists: true }
}

export async function handleUpcomingReminders(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized cron" }, { status: 401 })
  try {
    // Daily recovery on the existing scheduler; the dedicated endpoint supports a faster scheduler.
    after(async () => { const { drainEmailQueue } = await import("./dispatch"); await drainEmailQueue() })
    // Día UTC, consistente con el scheduler de Vercel y las fechas DATE de Supabase.
    const target = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)
    const canonical = await candidates(target, false, false)
    const legacy = await candidates(target, true, canonical.exists)
    if (!canonical.exists && !legacy.exists) throw new Error("Esquema de vencimientos no disponible")
    const clients = new Map([...canonical.rows, ...legacy.rows].map(row => [row.id, row]))
    const results = await sendInstallmentReminders(target)
    let sent = results.filter(r=>r.status === "sent").length
    for (const client of clients.values()) {
      const ownerId = client.owner_id ?? client.gym_id
      if (!ownerId) continue
      const { data: owner, error } = await supabase.from("owners").select("id, name, default_currency").eq("id", ownerId).eq("is_active", true).maybeSingle()
      if (error) throw new Error("No se pudo consultar la cuenta")
      if (!owner) continue
      if (!await legacyReminderEligible(ownerId,client.id)) continue
      // NULL conserva pagos legacy recurrentes; los únicos no generan elegibilidad.
      const { data: recurring, error: scheduleError } = await supabase.from("payments").select("id").eq("owner_id", ownerId).eq("client_id", client.id).or("payment_type.eq.recurring,payment_type.is.null").limit(1)
      if (scheduleError) throw new Error("No se pudo consultar el período recurrente")
      if (!recurring?.length) continue
      const result = await sendUpcomingDueEmail({
        ownerId, clientId: client.id, to: client.email, clientName: client.name,
        ownerName: owner.name ?? "Tu negocio", dueDate: target, remainingDebt: client.current_debt, currency: owner.default_currency,
        deduplicationKey: `upcoming-due:${ownerId}:${client.id}:${target}`,
      })
      if (result.status === "sent") sent++
      results.push({ clientId: client.id, status: result.status, providerEmailId: result.providerEmailId })
    }
    const failed = results.some(result => result.status === "failed" || result.status === "pending")
    return NextResponse.json({ ok: !failed, sent, count: results.length, results }, { status: failed ? 503 : 200 })
  } catch { return NextResponse.json({ error: "Error consultando recordatorios" }, { status: 503 }) }
}
