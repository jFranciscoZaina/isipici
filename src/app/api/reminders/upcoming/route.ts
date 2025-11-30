// src/app/api/dev/send-upcoming-reminders/route.ts
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import { sendUpcomingDueEmail } from "@/lib/email"

function formatDateDDMMYYYY(d: Date) {
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

// Endpoint para enviar recordatorios a clientes cuya cuota vence en 5 días.
// En producción esto lo dispara un CRON/Job, no el usuario final.
export async function POST(_req: NextRequest) {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const target = new Date(today)
    target.setDate(target.getDate() + 5)
    const targetISO = target.toISOString().slice(0, 10) // YYYY-MM-DD

    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id, name, email, next_payment_date, gym_id")
      .eq("next_payment_date", targetISO)
      .not("email", "is", null)

    if (clientsError) {
      console.error("Supabase clients error:", clientsError)
      return NextResponse.json(
        { error: "Error consultando clientes" },
        { status: 500 }
      )
    }

    if (!clients || clients.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No hay clientes con vencimiento dentro de 5 días",
      })
    }

    const results: { clientId: string; email: string; status: string }[] = []
    const gymName = "Tu gimnasio" // por ahora genérico

    for (const client of clients as any[]) {
      const clientEmail = client.email as string
      const clientName = client.name as string
      const gymId = client.gym_id ?? null
      const dueDateFormatted = formatDateDDMMYYYY(target)

      try {
        await sendUpcomingDueEmail({
          to: clientEmail,
          clientName,
          gymName,
          dueDate: dueDateFormatted,
        })

        const { error: logError } = await supabase.from("email_logs").insert({
          client_id: client.id,
          gym_id: gymId,
          type: "upcoming_due",
          subject: `Recordatorio de pago de cuota - ${gymName}`,
          due_date: targetISO,
          status: "sent",
          sent_at: new Date().toISOString(),
        })

        if (logError) {
          console.error("Error insertando email_logs:", logError)
        }

        results.push({ clientId: client.id, email: clientEmail, status: "sent" })
      } catch (err) {
        console.error("Error enviando recordatorio a", clientEmail, err)
        results.push({ clientId: client.id, email: clientEmail, status: "error" })
      }
    }

    return NextResponse.json({ ok: true, count: results.length, results })
  } catch (err) {
    console.error("Error en send-upcoming-reminders:", err)
    return NextResponse.json(
      { error: "Error interno enviando recordatorios" },
      { status: 500 }
    )
  }
}
