// src/app/api/reminders/due/route.ts
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import { sendUpcomingDueEmail } from "@/lib/email"

type DueClientRow = {
  id: string
  name: string
  email: string | null
  next_due: string | null
  owner_id: string
  current_debt?: number | null
  owners?: { name: string | null } | { name: string | null }[] | null
}

export async function GET(_req: NextRequest) {
  try {
    if (!process.env.CRON_SECRET || _req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const now = new Date()

    // target = hoy + 5 días
    const target = new Date(now)
    target.setDate(target.getDate() + 5)
    const targetDateStr = target.toISOString().slice(0, 10) // YYYY-MM-DD

    // Traer todos los clientes con vencimiento ese día
    // y join con owner para tener el nombre del owner
    const { data, error } = await supabase
      .from("clients")
      .select(
        `
        id,
        name,
        email,
        next_due,
        owner_id,
        current_debt,
        owners ( name )
      `
      )
      .eq("next_due", targetDateStr)
      .not("email", "is", null)

    if (error) throw error

    const rows = (data ?? []) as DueClientRow[]

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 })
    }

    let sent = 0

    for (const row of rows as DueClientRow[]) {
      const { data: activeOwner } = await supabase.from("owners").select("id").eq("id", row.owner_id).eq("is_active", true).maybeSingle()
      if (!activeOwner) continue
      const clientEmail = row.email as string
      const clientName = row.name
      const dueDate = row.next_due as string
      const ownerId = row.owner_id
      const ownerName = Array.isArray(row.owners)
        ? row.owners[0]?.name ?? "Tu negocio"
        : row.owners?.name ?? "Tu negocio"

      try {
        const remainingDebt =
          typeof row.current_debt === "number" ? row.current_debt : null

        await sendUpcomingDueEmail({
          to: clientEmail,
          clientName,
          ownerName,
          dueDate,
          remainingDebt,
        })

        await supabase.from("email_logs").insert({
          owner_id: ownerId,
          client_id: row.id,
          type: "upcoming_due",
          subject: `Recordatorio de cuota - ${ownerName}`,
          due_date: dueDate,
          status: "sent",
        })

        sent++
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : "unknown error"
        await supabase.from("email_logs").insert({
          owner_id: ownerId,
          client_id: row.id,
          type: "upcoming_due",
          subject: `Recordatorio de cuota - ${ownerName}`,
          due_date: dueDate,
          status: "failed",
          error_message: errorMessage,
        })
      }
    }

    return NextResponse.json({ ok: true, sent })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
