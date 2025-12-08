"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ClientRow, Payment } from "../page";
import Modal from "./Modal";
import { User as UserIcon, DollarSign, Mail as MailIcon } from "react-feather";

/** Log de emails del cliente */
type EmailLog = {
  id: string;
  sent_at: string;
  type: string;
  subject: string;
  due_date: string | null;
  status: string;
};

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

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);

  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);

  const [saving, setSaving] = useState(false);

  // === Load payment history (lazy por tab) ==========================
  useEffect(() => {
    if (activeTab !== "payments" || paymentsLoaded) return;

    const loadPayments = async () => {
      setLoadingPayments(true);
      try {
        const res = await fetch(`/api/payments?clientId=${client.id}`);

        if (!res.ok) {
          const txt = await res.text();
          console.error("Payments fetch failed:", res.status, txt);
          throw new Error("Error cargando historial");
        }

        const data: Payment[] = await res.json();
        setPayments(data);
        setPaymentsLoaded(true);
      } catch (e) {
        console.error(e);
        alert("Error cargando historial de pagos");
      } finally {
        setLoadingPayments(false);
      }
    };

    loadPayments();
  }, [activeTab, paymentsLoaded, client.id]);

  // === Load email history (siempre, es liviano) =====================
  useEffect(() => {
    const loadEmails = async () => {
      setLoadingEmails(true);
      try {
        const res = await fetch(`/api/clients/emails?clientId=${client.id}`);

        if (!res.ok) {
          const txt = await res.text();
          console.error("Emails fetch failed:", res.status, txt);
          throw new Error("Error cargando historial de emails");
        }

        const data: EmailLog[] = await res.json();
        setEmails(data);
      } catch (e) {
        console.error(e);
        alert(
          e instanceof Error ? e.message : "Error cargando historial de emails"
        );
      } finally {
        setLoadingEmails(false);
      }
    };

    loadEmails();
  }, [client.id]);

  // === Save changes ===================================================
  const handleSave = async () => {
    if (!isDirty || activeTab !== "data") return;

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

      if (!res.ok) throw new Error("Error guardando cambios");

      onChanged();
      onClose();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Error guardando cambios");
    } finally {
      setSaving(false);
    }
  };

  // === Helpers de formato ============================================

  const paymentLines = useMemo(() => {
    return payments.map((p) => {
      const fecha = new Date(p.created_at).toLocaleDateString("es-AR");
      const monto =
        "$" +
        (p.amount ?? 0).toLocaleString("es-AR", {
          maximumFractionDigits: 0,
        });
      const plan = p.plan ?? "sin plan";
      const deuda =
        p.debt && p.debt > 0
          ? " Debe " +
            "$" +
            p.debt.toLocaleString("es-AR", { maximumFractionDigits: 0 }) +
            "."
          : "";
      const vencimiento = p.period_to
        ? " Vence el " + new Date(p.period_to).toLocaleDateString("es-AR") + "."
        : "";

      return (
        <div key={p.id ?? p.created_at} className=" pb-p10">
          {fecha} – Pagó {monto} por el plan {plan}.
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
      const fecha = new Date(mail.sent_at).toLocaleDateString("es-AR");
      const tipo = mail.type;
      const vencimiento = mail.due_date
        ? " Vence el " +
          new Date(mail.due_date).toLocaleDateString("es-AR") +
          "."
        : "";
      return `${fecha} – Envío mail de “${tipo}”.${vencimiento}`;
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
      onClose={onClose}
      header={header}
      secondaryAction={secondaryAction}
      primaryAction={primaryAction}
    >
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
          {loadingPayments ? (
            <p className="text-app-secondary">Cargando historial...</p>
          ) : paymentLines.length === 0 ? (
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
          {loadingEmails ? (
            <p className="text-app-secondary">
              Cargando historial de emails...
            </p>
          ) : emailLines.length === 0 ? (
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
