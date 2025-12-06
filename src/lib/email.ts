// src/lib/email.ts
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY!)

type UpcomingDueEmailParams = {
  to: string
  clientName: string
  ownerName: string
  dueDate: string // ej: "05/12/2025"
}

export async function sendUpcomingDueEmail({
  to,
  clientName,
  ownerName,
  dueDate,
}: UpcomingDueEmailParams) {
  const from = process.env.EMAIL_FROM
  if (!from) {
    throw new Error("EMAIL_FROM is not set")
  }

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Recordatorio de pago de cuota - ${ownerName}`,
    html: `
      <p>Hola ${clientName},</p>
      <p>Te recordamos que tu cuota vence el día <strong>${dueDate}</strong>.</p>
      <p>Si ya realizaste el pago, podés ignorar este mensaje.</p>
      <p>¡Gracias por seguir entrenando con nosotros!</p>
    `,
  })

  if (error) {
    console.error("Resend error:", error)
    throw new Error(error.message)
  }
}
