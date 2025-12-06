// src/app/api/reminders/upcoming/route.ts
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import { sendUpcomingDueEmail } from "@/lib/email"

type UpcomingClientRow = {
  id: string
  name: string
  email: string | null
  next_payment_date: string | null
  gym_id: string | null
}

function formatDateDDMMYYYY(d: Date) {
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

// Lógica compartida para GET (cron) y POST (tests manuales)
async function handleUpcomingReminders(req: NextRequest) {
  // 🔐 Solo exigir el header en producción
  if (process.env.VERCEL_ENV === "production") {
    const auth = req.headers.get("authorization")
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized cron" }, { status: 401 })
    }
  }

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
    const gymName = "Tu gimnasio" // MVP

    for (const client of clients as UpcomingClientRow[]) {
      const clientEmail = client.email as string
      const clientName = client.name
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
        results.push({
          clientId: client.id,
          email: clientEmail,
          status: "error",
        })
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

// 👉 cron de Vercel usa GET
export async function GET(req: NextRequest) {
  return handleUpcomingReminders(req)
}

// 👉 para testear desde consola con fetch POST
export async function POST(req: NextRequest) {
  return handleUpcomingReminders(req)
}
