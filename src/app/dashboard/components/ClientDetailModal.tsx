"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ClientRow, Payment } from "../page";
import {useRemoteData} from "./useRemoteData"
import {useToast} from "./ToastProvider"
import Modal from "./Modal";
import SubscriptionPanel from "./SubscriptionPanel";
import { formatCalendarDate, formatPaymentPeriod } from "@/lib/payments/schedule";
import { formatPaymentMoney } from "@/lib/payments/format";
import { User as UserIcon, DollarSign, Mail as MailIcon } from "react-feather";

/** Log de emails del cliente */
type EmailLog = {
  id: string;
  sent_at: string | null;
  created_at?: string;
  delivery_status?: string | null;
  type: string;
  subject: string;
  due_date: string | null;
  status: string;
};

const emptyPayments:Payment[]=[];
const emptyEmails:EmailLog[]=[];
export type TabId = "data" | "payments" | "emails";

type Props = {
  client: ClientRow;
  onClose: () => void;
  onChanged: () => void;
  initialTab?: TabId;
};

export default function ClientDetailModal({
  client,
  onClose,
  onChanged,
  initialTab = "data",
}: Props) {
  // === Local state ==================================================
  const [email, setEmail] = useState(client.email ?? "");
  const [phone, setPhone] = useState(client.phone ?? "");
  const [address, setAddress] = useState(client.address ?? "");
  const [addressNumber, setAddressNumber] = useState(
    client.addressNumber ?? ""
  );

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // si el modal se reabre para otro cliente/pestaña
  useEffect(() => {
    setActiveTab(initialTab);
    setEmail(client.email ?? "");
    setPhone(client.phone ?? "");
    setAddress(client.address ?? "");
    setAddressNumber(client.addressNumber ?? "");
  }, [
    initialTab,
    client.id,
    client.email,
    client.phone,
    client.address,
    client.addressNumber,
  ]);

  // valores originales para saber si hubo cambios
  const originalEmail = client.email ?? "";
  const originalPhone = client.phone ?? "";
  const originalAddress = client.address ?? "";
  const originalAddressNumber = client.addressNumber ?? "";

  const isDirty =
    email !== originalEmail ||
    phone !== originalPhone ||
    address !== originalAddress ||
    addressNumber !== originalAddressNumber;

  const toast=useToast();
  const paymentRemote=useRemoteData<Payment[]>(`/api/payments?clientId=${client.id}`,"Cargando historial de pagos...","No se pudo cargar el historial de pagos.",activeTab==="payments");
  const emailRemote=useRemoteData<EmailLog[]>(`/api/clients/emails?clientId=${client.id}`,"Cargando emails...","No se pudieron cargar los emails.",activeTab==="emails");
  const payments=paymentRemote.data??emptyPayments,emails=emailRemote.data??emptyEmails;
  const [saving,setSaving]=useState(false);

  // === Save changes ===================================================
  const handleSave = async () => {
    if (!isDirty || activeTab !== "data" || saving) return;
    const operation=toast.start("Guardando cliente...");

    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          phone,
          address,
          addressNumber,
        }),
      });

      if(res.status===401){window.location.href="/login";operation.close();return;}
      if (!res.ok) throw new Error("No se pudo actualizar el cliente.");
      operation.success("Cliente actualizado.");

      onChanged();
      onClose();
    } catch (err) {
      console.error(err);
      operation.error("No se pudo actualizar el cliente.");
    } finally {
      operation.close();setSaving(false);
    }
  };

  // === Helpers de formato ============================================

  const paymentLines = useMemo(() => {
    return payments.map((p) => {
      const fecha = new Date(p.created_at).toLocaleDateString("es-AR");
      const monto = formatPaymentMoney(p.amount ?? 0, p.currency);
      const plan = p.concept ?? p.plan ?? "Pago";
      const deuda =
        p.payment_type !== "one_off" && p.debt && p.debt > 0
          ? " Debe " +
            formatPaymentMoney(p.debt, p.currency) +
            "."
          : "";
      const periodText = formatPaymentPeriod(p.period_from,p.period_to,p.service_date);
      const vencimiento = p.payment_type !== "one_off" && p.next_payment_date
        ? " Próximo vencimiento: " + formatCalendarDate(p.next_payment_date) + "."
        : "";

      return (
        <div key={p.id ?? p.created_at} className=" pb-p10">
          {fecha} – Pagó {monto} por {plan}.{p.payment_type === "one_off" ? " Pago único." : ""}
          {p.payment_allocations?.map((allocation,index)=><React.Fragment key={index}><br />Cuota: {formatPaymentPeriod(allocation.installment?.period_from,allocation.installment?.period_to)} · Aplicado: {formatPaymentMoney(allocation.amount_applied,p.currency)} · Bonificación: {formatPaymentMoney(allocation.discount_applied,p.currency)}</React.Fragment>)}
          {periodText && <><br />{p.period_from && p.period_to && p.period_from !== p.period_to ? "Período" : "Servicio"}: {periodText}.</>}
          {p.receipt_note && <p className="fs-12 text-app-secondary whitespace-pre-wrap break-words">{p.receipt_note}</p>}
          {/* Bloque Condicional para 'deuda' */}
          {deuda && (
            <>
              <br />
              {deuda}
            </>
          )}
          {/* Bloque Condicional para 'vencimiento' */}
          {vencimiento && (
            <>
              <br />
              {vencimiento}
            </>
          )}
        </div>
      );
    });
  }, [payments]);

  const emailLines = useMemo(() => {
    return emails.map((mail) => {
      const timestamp = mail.sent_at ?? mail.created_at;
      const fecha = timestamp ? new Date(timestamp).toLocaleDateString("es-AR") : "Sin fecha";
      const tipo = mail.type === "payment_receipt" ? "Comprobante de pago" : mail.type === "upcoming_due" ? "Recordatorio de pago" : mail.type;
      const labels: Record<string, string> = { pending: "Pendiente", sent: "Enviado", delivered: "Entregado", delivery_delayed: "Entrega demorada", opened: "Abierto", clicked: "Enlace visitado", bounced: "Rebotado", complained: "Marcado como spam", failed: "Fallido" };
      const status = mail.delivery_status ?? mail.status;
      const vencimiento = mail.due_date
        ? " Vence el " +
          formatCalendarDate(mail.due_date) +
          "."
        : "";
      return `${fecha} – ${tipo}: ${labels[status] ?? "Estado desconocido"}. ${mail.subject}.${vencimiento}`;
    });
  }, [emails]);

  // === HEADER para Modal (tabs centradas) ============================

  const header = (
    <div className="flex flex-col items-center w-full">
      <div className="flex items-center justify-around gap-p40 w-full px-p20">
        <TabButton
          icon={UserIcon}
          label="Perfil"
          isActive={activeTab === "data"}
          onClick={() => setActiveTab("data")}
        />
        <TabButton
          icon={DollarSign}
          label="Pagos"
          isActive={activeTab === "payments"}
          onClick={() => setActiveTab("payments")}
        />
        <TabButton
          icon={MailIcon}
          label="Emails"
          isActive={activeTab === "emails"}
          onClick={() => setActiveTab("emails")}
        />
      </div>
    </div>
  );

  // === FOOTER actions para Modal =====================================

  const secondaryAction = {
    label: "Regresar",
    onClick: onClose,
  };

  const primaryAction = {
    label: saving ? "Guardando..." : "Guardar cambios",
    onClick: handleSave,
    disabled: saving || !isDirty || activeTab !== "data",
  };

  // ====================================================================
  // === RENDER =========================================================
  // ====================================================================
  return (
    <Modal
      size="normal"
      onClose={()=>{if(!saving)onClose()}}
      header={header}
      secondaryAction={secondaryAction}
      primaryAction={primaryAction}
    >
      {activeTab === "data" && <SubscriptionPanel clientId={client.id} onChanged={onChanged} />}
      {/* TAB: Datos / Perfil */}
      {activeTab === "data" && (
        <div className="flex flex-col gap-p10">
          <Field label="Nombre">
            <input
              value={client.name}
              readOnly
              className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app-secondary"
            />
          </Field>

          <Field label="Email">
            <input
              className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field label="N° de teléfono">
            <input
              className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>

          <Field label="Domicilio">
            <input
              className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Field>

          <Field label="Número / piso / depto">
            <input
              className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
              value={addressNumber}
              onChange={(e) => setAddressNumber(e.target.value)}
            />
          </Field>
        </div>
      )}

      {/* TAB: Historial de Pagos */}
      {activeTab === "payments" && (
        <div className="space-y-p20 fs-14 text-app">
          {paymentRemote.error&&<button className="btn-secondary" onClick={()=>void paymentRemote.refresh()}>Reintentar</button>}
          {!paymentRemote.data ? (
            <div className="min-h-20" aria-busy={paymentRemote.loading}/>
          ) : paymentRemote.status === "success" && paymentLines.length === 0 ? (
            <p className="text-app-secondary">
              Este cliente aún no tiene pagos registrados.
            </p>
          ) : (
            <ul className="list-disc pl-6 space-y-p10">
              {paymentLines.map((line, idx) => (
                <li key={`payment-${idx}`}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* TAB: Historial de emails */}
      {activeTab === "emails" && (
        <div className="space-y-p20 fs-14 text-app">
          {emailRemote.error&&<button className="btn-secondary" onClick={()=>void emailRemote.refresh()}>Reintentar</button>}
          {!emailRemote.data ? (
            <div className="min-h-20" aria-busy={emailRemote.loading}/>
          ) : emailRemote.status === "success" && emailLines.length === 0 ? (
            <p className="text-app-secondary">
              Todavía no se enviaron emails a este cliente.
            </p>
          ) : (
            <ul className="list-disc pl-6 space-y-p10">
              {emailLines.map((line, idx) => (
                <li key={`email-${idx}`}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ===== Subcomponentes UI ===== */

type TabButtonProps = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  isActive: boolean;
  onClick: () => void;
};

function TabButton({ icon: Icon, label, isActive, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-p10
        
       
        fs-14 font-medium
        transition-colors
        ${
          isActive
            ? "border-n8 text-app"
            : "border-transparent text-app-secondary hover:text-app"
        }
      `}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </button>
  );
}

type FieldProps = {
  label: string;
  children: React.ReactNode;
};

function Field({ label, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-p5">
      <label className="fs-12 text-app-secondary">{label}</label>
      {children}
    </div>
  );
}
