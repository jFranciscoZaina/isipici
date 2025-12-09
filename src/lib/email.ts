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

type PaymentReceiptEmailParams = {
  to: string
  clientName: string
  ownerName: string
  amount: number
  dueDate: string | null // formato ISO: "2025-12-05" o null
  plan?: string | null
}

export async function sendPaymentReceiptEmail({
  to,
  clientName,
  ownerName,
  amount,
  dueDate,
  plan,
}: PaymentReceiptEmailParams) {
  const from = process.env.EMAIL_FROM
  if (!from) {
    throw new Error("EMAIL_FROM is not set")
  }

  const amountFormatted = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(amount)

  const dueDateText = dueDate
    ? new Date(dueDate).toLocaleDateString("es-AR")
    : "sin fecha de vencimiento registrada"

  const planText = plan ?? "tu plan"

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Pago registrado - ${ownerName}`,
    html: `
      <p>Hola ${clientName},</p>
      <p></p>Hemos registrado el pago que realizaste a ${ownerName}.</p>
      <p>Registramos tu pago para <strong>${planText}</strong>.</p>
      <p><strong>Monto:</strong> ${amountFormatted}</p>
      <p><strong>Fecha de vencimiento:</strong> ${dueDateText}</p>
      <p>¡Gracias por seguir entrenando con nosotros!</p>
    `,
  })

  if (error) {
    console.error("Resend error (payment receipt):", error)
    throw new Error(error.message)
  }
}
