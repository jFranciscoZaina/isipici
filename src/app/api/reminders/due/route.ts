// src/app/api/reminders/due/route.ts
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import { sendUpcomingDueEmail } from "@/lib/email"

export async function GET(req: NextRequest) {
  try {
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

    for (const row of rows as any[]) {
      const clientEmail = row.email as string
      const clientName = row.name as string
      const dueDate = row.next_due as string
      const gymId = row.gym_id as string
      const gymName = row.owners?.name ?? "Tu gimnasio"

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
      } catch (e: any) {
        await supabase.from("email_logs").insert({
          gym_id: gymId,
          client_id: row.id,
          type: "upcoming_due",
          subject: `Recordatorio de cuota - ${gymName}`,
          due_date: dueDate,
          status: "failed",
          error_message: e?.message ?? "unknown error",
        })
      }
    }

    return NextResponse.json({ ok: true, sent })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
