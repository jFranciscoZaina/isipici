// src/lib/email.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

type UpcomingDueEmailParams = {
  to: string;
  clientName: string;
  ownerName: string;
  dueDate: string; // ej: "05/12/2025"
  remainingDebt?: number | null;
};

export async function sendUpcomingDueEmail({
  to,
  clientName,
  ownerName,
  dueDate,
  remainingDebt,
}: UpcomingDueEmailParams) {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM is not set");
  }

  const remainingDebtText =
    remainingDebt && remainingDebt > 0
      ? new Intl.NumberFormat("es-AR", {
          style: "currency",
          currency: "ARS",
          minimumFractionDigits: 2,
        }).format(remainingDebt)
      : null;

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Recordatorio de pago de cuota - ${ownerName}`,
    html: `
      <!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Recordatorio de pago</title>
  </head>

  <body
    style="
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background: #000000 !important;
      color: #ffffff !important;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      overflow-x: hidden;
      font-family: Arial, Helvetica, sans-serif;
    "
  >
    <!-- Preheader (hidden) -->
    <div
      style="
        display: none;
        font-size: 1px;
        line-height: 1px;
        max-height: 0px;
        max-width: 0px;
        opacity: 0;
        overflow: hidden;
        mso-hide: all;
      "
    >
      Recordatorio: tu cuota vence el ${dueDate}.
    </div>

    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      bgcolor="#000000"
      style="
        width: 100% !important;
        border-collapse: collapse;
        mso-table-lspace: 0pt;
        mso-table-rspace: 0pt;
        background: #000000 !important;
      "
    >
      <tr>
        <td align="center" style="padding: 0; margin: 0;">
          <!-- Main container -->
          <table
            role="presentation"
            width="100%"
            cellpadding="0"
            cellspacing="0"
            border="0"
            style="
              width: 100%;
              max-width: 600px;
              border-collapse: collapse;
              mso-table-lspace: 0pt;
              mso-table-rspace: 0pt;
              background: #000000 !important;
            "
          >
            <tr>
              <td style="padding: 40px 24px 18px 24px; color: #ffffff !important;">
                <!-- Headings -->
                <div
                  style="
                    font-size: 44px;
                    line-height: 1.05;
                    font-weight: 900;
                    text-transform: uppercase;
                    letter-spacing: -1px;
                    margin: 0;
                    color: #ffffff !important;
                  "
                >
                  Recordatorio
                </div>
                <div
                  style="
                    font-size: 44px;
                    line-height: 1.05;
                    font-weight: 900;
                    text-transform: uppercase;
                    letter-spacing: -1px;
                    margin: 0 0 16px 0;
                    color: #ffffff !important;
                  "
                >
                  de pago
                </div>

                <div
                  style="
                    font-size: 18px;
                    line-height: 1.55;
                    color: #d0d0d0 !important;
                    margin: 0 0 26px 0;
                  "
                >
                  Hola ${clientName}, te recordamos que tu cuota vence el día
                  <span style="color: #ffffff !important; font-weight: 800;">${dueDate}</span>.
                </div>

                <!-- Due date row -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                  <tr>
                    <td style="padding: 0 0 18px 0;">
                      <div style="border-bottom: 1px solid #333333;">
                        <div
                          style="
                            font-size: 12px;
                            letter-spacing: 0.08em;
                            text-transform: uppercase;
                            color: #c9c9c9 !important;
                            margin: 0 0 6px 0;
                          "
                        >
                          Vence el
                        </div>
                        <div
                          style="
                            font-size: 22px;
                            line-height: 1.3;
                            font-weight: 800;
                            color: #ffffff !important;
                            padding: 0 0 12px 0;
                          "
                        >
                          ${dueDate}
                        </div>
                      </div>
                    </td>
                  </tr>
                </table>

                <!-- Debt alert (same logic style as receipt: show only if there is remainingDebtText) -->
                ${
                  remainingDebtText
                    ? `
                <div style="margin-top: 6px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                    <tr>
                      <td
                        bgcolor="#FF3B30"
                        style="
                          background: #FF3B30 !important;
                          color: #ffffff !important;
                          padding: 16px 16px;
                          font-family: Arial, Helvetica, sans-serif;
                          border-radius: 4px;
                        "
                      >
                        <div style="font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 800;">
                          Tenés deuda pendiente: ${remainingDebtText}
                        </div>
                        <div style="font-size: 14px; margin-top: 6px; font-weight: 400;">
                          Podés regularizarla junto con tu próxima cuota.
                        </div>
                      </td>
                    </tr>
                  </table>
                </div>
                `
                    : ""
                }

                <div
                  style="
                    color: #d0d0d0 !important;
                    font-size: 16px;
                    line-height: 1.5;
                    margin: 18px 0 0 0;
                  "
                >
                  ¡Gracias por seguir entrenando con nosotros!
                </div>
              </td>
            </tr>
          </table>

          <!-- Full-bleed logo section -->
          <table
            role="presentation"
            width="100%"
            cellpadding="0"
            cellspacing="0"
            border="0"
            bgcolor="#000000"
            style="
              width: 100% !important;
              border-collapse: collapse;
              mso-table-lspace: 0pt;
              mso-table-rspace: 0pt;
              background: #000000 !important;
            "
          >
            <tr>
              <td align="center" style="padding: 16px 0 0 0; margin: 0;">
                <img
                  src="https://i.ibb.co/kVSWh4cV/Recurso-9-0-5x.png"
                  alt="ISIPICI"
                  width="1200"
                  style="
                    width: 600% !important;
                    max-width: 1200px;
                    height: auto;
                    display: block;
                    border: 0;
                    outline: none;
                    text-decoration: none;
                    -ms-interpolation-mode: bicubic;
                    background: #000000 !important;
                  "
                />
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>

    `,
  });

  if (error) {
    console.error("Resend error:", error);
    throw new Error(error.message);
  }
}

type PaymentReceiptEmailParams = {
  to: string;
  clientName: string;
  ownerName: string;
  amount: number;
  dueDate: string | null;
  plan?: string | null;
  remainingDebt?: number | null;
};

export async function sendPaymentReceiptEmail({
  to,
  clientName,
  ownerName,
  amount,
  dueDate,
  plan,
  remainingDebt,
}: PaymentReceiptEmailParams) {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM is not set");
  }

  const amountFormatted = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(amount);

  const dueDateText = dueDate
    ? new Date(dueDate).toLocaleDateString("es-AR")
    : "sin fecha de vencimiento registrada";

  const planText = plan ?? "tu plan";

  const remainingDebtText =
    remainingDebt && remainingDebt > 0
      ? new Intl.NumberFormat("es-AR", {
          style: "currency",
          currency: "ARS",
          minimumFractionDigits: 2,
        }).format(remainingDebt)
      : null;

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Pago registrado - ${ownerName}`,
    html: `
      <!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Pago registrado</title>
  </head>

  <body
    style="
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background: #000000 !important;
      color: #ffffff !important;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      overflow-x: hidden;
    "
  >
    <!-- Preheader (hidden) -->
    <div
      style="
        display: none;
        font-size: 1px;
        line-height: 1px;
        max-height: 0px;
        max-width: 0px;
        opacity: 0;
        overflow: hidden;
        mso-hide: all;
      "
    >
      Hola ${clientName}, tu pago fue registrado por ${ownerName}.
    </div>

    <!-- Full width background -->
    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      bgcolor="#000000"
      style="
        width: 100% !important;
        border-collapse: collapse;
        mso-table-lspace: 0pt;
        mso-table-rspace: 0pt;
        background: #000000 !important;
      "
    >
      <tr>
        <td align="center" style="padding: 0; margin: 0;">
          <!-- Main container (responsive) -->
          <table
            role="presentation"
            width="100%"
            cellpadding="0"
            cellspacing="0"
            border="0"
            style="
              width: 100%;
              max-width: 600px;
              border-collapse: collapse;
              mso-table-lspace: 0pt;
              mso-table-rspace: 0pt;
              background: #000000 !important;
            "
          >
            <tr>
              <td
                style="
                  padding: 40px 24px 28px 24px;
                  font-family: Arial, Helvetica, sans-serif;
                  color: #ffffff !important;
                  background: #000000 !important;
                "
              >
                <!-- Headings -->
                <div
                  style="
                    font-size: 48px;
                    line-height: 1.05;
                    font-weight: 900;
                    text-transform: uppercase;
                    letter-spacing: -1px;
                    margin: 0;
                    color: #ffffff !important;
                  "
                >
                  Pago
                </div>
                <div
                  style="
                    font-size: 48px;
                    line-height: 1.05;
                    font-weight: 900;
                    text-transform: uppercase;
                    letter-spacing: -1px;
                    margin: 0 0 14px 0;
                    color: #ffffff !important;
                  "
                >
                  Confirmado
                </div>

                <div
                  style="
                    font-size: 18px;
                    line-height: 1.5;
                    color: #d0d0d0 !important;
                    margin: 0 0 34px 0;
                  "
                >
                  Hola ${clientName}, tu pago ha sido registrado por ${ownerName}.
                </div>

                <!-- Data rows -->
                <table
                  role="presentation"
                  width="100%"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                  style="width: 100%; border-collapse: collapse;"
                >
                  <tr>
                    <td style="padding: 0 0 18px 0;">
                      <div style="border-bottom: 1px solid #333333;">
                        <div
                          style="
                            font-size: 12px;
                            letter-spacing: 0.08em;
                            text-transform: uppercase;
                            color: #c9c9c9 !important;
                            margin: 0 0 6px 0;
                          "
                        >
                          Detalle del pago
                        </div>
                        <div
                          style="
                            font-size: 22px;
                            line-height: 1.3;
                            font-weight: 700;
                            color: #ffffff !important;
                            padding: 0 0 12px 0;
                          "
                        >
                          ${planText}
                        </div>
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding: 0 0 18px 0;">
                      <div style="border-bottom: 1px solid #333333;">
                        <div
                          style="
                            font-size: 12px;
                            letter-spacing: 0.08em;
                            text-transform: uppercase;
                            color: #c9c9c9 !important;
                            margin: 0 0 6px 0;
                          "
                        >
                          Monto
                        </div>
                        <div
                          style="
                            font-size: 22px;
                            line-height: 1.3;
                            font-weight: 700;
                            color: #ffffff !important;
                            padding: 0 0 12px 0;
                          "
                        >
                          ${amountFormatted}
                        </div>
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding: 0 0 18px 0;">
                      <div style="border-bottom: 1px solid #333333;">
                        <div
                          style="
                            font-size: 12px;
                            letter-spacing: 0.08em;
                            text-transform: uppercase;
                            color: #c9c9c9 !important;
                            margin: 0 0 6px 0;
                          "
                        >
                          Vence el
                        </div>
                        <div
                          style="
                            font-size: 22px;
                            line-height: 1.3;
                            font-weight: 700;
                            color: #ffffff !important;
                            padding: 0 0 12px 0;
                          "
                        >
                          ${dueDateText}
                        </div>
                      </div>
                    </td>
                  </tr>
                </table>

                <div
                  style="
                    color: #d0d0d0 !important;
                    font-size: 16px;
                    line-height: 1.5;
                    margin: 26px 0 0 0;
                  "
                >
                  ¡A seguir entrenando!
                </div>

                ${
                  remainingDebtText
                    ? `
                <div style="margin-top: 22px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                    <tr>
                      <td
                        bgcolor="#FF3B30"
                        style="
                          background: #FF3B30 !important;
                          color: #ffffff !important;
                          padding: 16px 16px;
                          font-family: Arial, Helvetica, sans-serif;
                          border-radius: 4px;
                        "
                      >
                        <div style="font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 800;">
                          Saldo pendiente: ${remainingDebtText}
                        </div>
                        <div style="font-size: 14px; margin-top: 6px; font-weight: 400;">
                          Por favor, atendé este pago.
                        </div>
                      </td>
                    </tr>
                  </table>
                </div>
                `
                    : ""
                }
              </td>
            </tr>
          </table>

          <!-- Full-bleed logo section (no max-width) -->
          <table
            role="presentation"
            width="100%"
            cellpadding="0"
            cellspacing="0"
            border="0"
            bgcolor="#000000"
            style="
              width: 100% !important;
              border-collapse: collapse;
              mso-table-lspace: 0pt;
              mso-table-rspace: 0pt;
              background: #000000 !important;
            "
          >
            <tr>
              <td align="center" style="padding: 16px 0 0 0; margin: 0;">
                <img
                  src="https://i.ibb.co/kVSWh4cV/Recurso-9-0-5x.png"
                  alt="ISIPICI"
                  width="1200"
                  style="
                    width: 60% !important;
                    max-width: 1200px;
                    height: auto;
                    display: block;
                    border: 0;
                    outline: none;
                    text-decoration: none;
                    -ms-interpolation-mode: bicubic;
                    background: #000000 !important;
                  "
                />
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>

    `,
  });

  if (error) {
    console.error("Resend error (payment receipt):", error);
    throw new Error(error.message);
  }
}
