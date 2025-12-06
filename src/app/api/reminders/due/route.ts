// src/app/api/reminders/due/route.ts
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import { sendUpcomingDueEmail } from "@/lib/email"

type DueClientRow = {
  id: string
  name: string
  email: string | null
  next_due: string | null
  gym_id: string
  gyms?: { name: string | null } | null
}

export async function GET(_req: NextRequest) {
  try {
    void _req
    const now = new Date()

    // target = hoy + 5 días
    const target = new Date(now)
    target.setDate(target.getDate() + 5)
    const targetDateStr = target.toISOString().slice(0, 10) // YYYY-MM-DD

    // Traer todos los clientes con vencimiento ese día
    // y join con gym para tener el nombre del gym
    const { data: rows, error } = await supabase
      .from("clients")
      .select(
        `
        id,
        name,
        email,
        next_due,
        gym_id,
        gyms ( name )
      `
      )
      .eq("next_due", targetDateStr)
      .not("email", "is", null)

    if (error) throw error
    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 })
    }

    let sent = 0

    for (const row of rows as DueClientRow[]) {
      const clientEmail = row.email as string
      const clientName = row.name
      const dueDate = row.next_due as string
      const gymId = row.gym_id
      const gymName = row.gyms?.name ?? "Tu gimnasio"

      try {
        await sendUpcomingDueEmail({
          to: clientEmail,
          clientName,
          gymName,
          dueDate,
        })

        await supabase.from("email_logs").insert({
          gym_id: gymId,
          client_id: row.id,
          type: "upcoming_due",
          subject: `Recordatorio de cuota - ${gymName}`,
          due_date: dueDate,
          status: "sent",
        })

        sent++
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : "unknown error"
        await supabase.from("email_logs").insert({
          gym_id: gymId,
          client_id: row.id,
          type: "upcoming_due",
          subject: `Recordatorio de cuota - ${gymName}`,
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
