import { escapeHtml, formatDate, formatMoney } from "../format"
export type ReceiptTemplateInput = { to: string; clientName: string; ownerName: string; amount: number; dueDate: string | null; plan?: string | null; remainingDebt?: number | null; }
export function renderPaymentReceipt(input: ReceiptTemplateInput) {
  const clientName = escapeHtml(input.clientName)
  const ownerName = escapeHtml(input.ownerName)
  const amountFormatted = formatMoney(input.amount)
  const dueDateText = input.dueDate ? escapeHtml(formatDate(input.dueDate)) : "sin fecha de vencimiento registrada"
  const planText = escapeHtml(input.plan ?? "tu plan")
  const remainingDebtText = input.remainingDebt && input.remainingDebt > 0 ? formatMoney(input.remainingDebt) : null
  // Logo externo desactivado hasta disponer de una imagen estable en nuestro dominio.
  return { subject: `Pago registrado - ${input.ownerName}`, html: `
      <!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />

<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />

    <style>
      /* Base inline legible incluso sin soporte de media queries. */
      @media screen and (min-width: 480px) {
        .email-title { font-size: 48px !important; }
        .email-content { padding-left: 24px !important; padding-right: 24px !important; }
        .email-copy { font-size: 18px !important; }
        .email-value { font-size: 22px !important; }
      }
    </style>
    <title>Pago registrado</title>
  </head>

  <body bgcolor="#000000"
    style="
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background: #000000 !important;
      color: #ffffff !important;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    "
  >
    <!-- Preheader (hidden) -->
    <div
      style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;
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
        border-collapse: collapse; table-layout: fixed;
        mso-table-lspace: 0pt;
        mso-table-rspace: 0pt;
        background: #000000 !important;
      "
    >
      <tr>
        <td align="center" bgcolor="#000000" style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;padding: 0; margin: 0; background: #000000 !important;">
          <!-- Main container (responsive) -->
          <table
            role="presentation"
            width="100%"
            cellpadding="0"
            cellspacing="0"
            border="0"
            bgcolor="#000000"
            style="
              width: 100%;
              max-width: 600px;
              border-collapse: collapse; table-layout: fixed;
              mso-table-lspace: 0pt;
              mso-table-rspace: 0pt;
              background: #000000 !important;
            "
          >
            <tr>
              <td class="email-content"
                style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;
                  padding: 28px 16px 28px 16px;
                  font-family: Arial, Helvetica, sans-serif;
                  color: #ffffff !important;
                  background: #000000 !important;
                "
              >
                <!-- Headings -->
                <div
                  class="email-title"
                  style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;
                    font-size: 30px;
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
                  class="email-title"
                  style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;
                    font-size: 30px;
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
                  class="email-copy"
                  style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;
                    font-size: 16px;
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
                  style="width: 100%; border-collapse: collapse; table-layout: fixed;"
                >
                  <tr>
                    <td style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;padding: 0 0 18px 0;">
                      <div style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;border-bottom: 1px solid #333333;">
                        <div
                          style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;
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
                          class="email-value"
                          style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;
                            font-size: 20px;
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
                    <td style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;padding: 0 0 18px 0;">
                      <div style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;border-bottom: 1px solid #333333;">
                        <div
                          style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;
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
                          class="email-value"
                          style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;
                            font-size: 20px;
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
                    <td style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;padding: 0 0 18px 0;">
                      <div style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;border-bottom: 1px solid #333333;">
                        <div
                          style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;
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
                          class="email-value"
                          style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;
                            font-size: 20px;
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
                  style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;
                    color: #d0d0d0 !important;
                    font-size: 16px;
                    line-height: 1.5;
                    margin: 26px 0 0 0;
                  "
                >
                  ¡Gracias por tu pago!
                </div>

                ${
                  remainingDebtText
                    ? `
                <div style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;margin-top: 22px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; table-layout: fixed;">
                    <tr>
                      <td
                        bgcolor="#FF3B30"
                        style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;
                          background: #FF3B30 !important;
                          color: #ffffff !important;
                          padding: 16px 16px;
                          font-family: Arial, Helvetica, sans-serif;
                          border-radius: 4px;
                        "
                      >
                        <div style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 800;">
                          Saldo pendiente: ${remainingDebtText}
                        </div>
                        <div style="overflow-wrap: anywhere; word-wrap: break-word; word-break: break-word;font-size: 14px; margin-top: 6px; font-weight: 400;">
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

          <!-- Logo temporalmente desactivado: imagen externa no disponible. -->
        </td>
      </tr>
    </table>
  </body>
</html>

    ` }
}
