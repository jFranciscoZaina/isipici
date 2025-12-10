"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ClientRow, PlanType } from "../page";
import { PLANS } from "../page";
import RangeCalendar, { type DateRangeValue } from "./RangeCalendar";
import ClientSearchSelect from "./ClientSearchSelect";
import Modal from "./Modal";
import { DollarSign } from "react-feather";

type Props = {
  clients: ClientRow[];
  onClose: () => void;
  onCreated: () => void;
  preselectedClientId?: string;
};

type PaymentRow = {
  id: string;
  amount: number;
  plan: string | null;
  discount: number | null;
  debt: number | null;
  period_from: string | null;
  period_to: string | null;
  created_at: string;
};

const toISO = (d?: Date) =>
  d
    ? new Date(d.getFullYear(), d.getMonth(), d.getDate())
        .toISOString()
        .slice(0, 10)
    : "";

const parseISO = (s?: string | null) =>
  s ? new Date(s + "T00:00:00") : undefined;

export default function NewPaymentModal({
  clients,
  onClose,
  onCreated,
  preselectedClientId,
}: Props) {
  const [clientId, setClientId] = useState(preselectedClientId ?? "");
  const [plan, setPlan] = useState<PlanType | "">("");
  const [amount, setAmount] = useState<number | "">("");
  const [discount, setDiscount] = useState<number | "">("");
  const [debt, setDebt] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  const [selectedClientDebt, setSelectedClientDebt] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // markers para el calendario (pagado / deuda)
  const [markers, setMarkers] = useState<Record<string, "paid" | "debt">>({});

  // === Range calendar
  const [dateRange, setDateRange] = useState<DateRangeValue>({});
  const [calendarLocked, setCalendarLocked] = useState(false);

  // derived ISO for submit
  const periodFrom = toISO(dateRange.from);
  const periodTo = toISO(dateRange.to);

  const selectedClient = clients.find((c) => c.id === clientId);
  const hasDebt = (selectedClient?.currentDebt ?? 0) > 0;
  const availablePlans = useMemo(
    () => (hasDebt ? PLANS : PLANS.filter((p) => p !== "Pago deuda")),
    [hasDebt]
  );

  const handleClientChange = async (id: string) => {
    setClientId(id);

    const c = clients.find((cl) => cl.id === id);
    const d = c ? Number(c.currentDebt || 0) : 0;
    setSelectedClientDebt(d);

    // --- 1) Traer TODOS los pagos del cliente (tenga o no deuda) ---
    let pays: PaymentRow[] = [];

    try {
      const res = await fetch(`/api/payments?clientId=${id}`);
      if (res.ok) {
        pays = await res.json();
      }
    } catch (e) {
      console.log("No pude cargar pagos del cliente:", e);
    }

    // --- 2) Construir markers para el calendario ---
    const nextMarkers: Record<string, "paid" | "debt"> = {};

    pays.forEach((p) => {
      if (!p.period_from || !p.period_to) return;

      const from = new Date(p.period_from + "T00:00:00");
      const to = new Date(p.period_to + "T00:00:00");

      for (let t = new Date(from); t <= to; t.setDate(t.getDate() + 1)) {
        const key = t.toISOString().slice(0, 10);
        nextMarkers[key] = Number(p.debt || 0) > 0 ? "debt" : "paid";
      }
    });

    // Si la deuda actual es 0, todos los días pasan a "paid"
    if (d === 0) {
      for (const key in nextMarkers) {
        nextMarkers[key] = "paid";
      }
    }

    setMarkers(nextMarkers);

    // --- 3) Lógica de deuda / bloqueo de calendario ---
    if (d > 0) {
      setPlan("Pago deuda");
      setDiscount(0);

      const withDebt = pays.filter((p) => Number(p.debt || 0) > 0);
      const lastDebt = withDebt.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0];

      if (lastDebt?.period_from && lastDebt?.period_to) {
        const from = parseISO(lastDebt.period_from);
        const to = parseISO(lastDebt.period_to);

        setDateRange({ from, to });
        setCalendarLocked(true);

        // amount arranca como deuda total
        setAmount(d);
        setDebt(0);
        return;
      }

      // fallback si hay deuda pero no encontramos período
      setCalendarLocked(false);
      setDateRange({});
      setAmount(d);
      setDebt(0);
    } else {
      // no hay deuda: todo editable, sin rango preseleccionado
      setCalendarLocked(false);
      setPlan("");
      setAmount("");
      setDiscount("");
      setDebt("");
      setDateRange({});
    }
  };

  const handlePlanChange = (value: PlanType) => {
    if (hasDebt) return; // bloqueado
    setPlan(value);
  };

  // === descuento recalcula amount y deuda (solo Pago deuda) ==========
  useEffect(() => {
    if (plan !== "Pago deuda") return;

    const baseDebt = selectedClientDebt || 0;
    const disc =
      typeof discount === "number" ? discount : Number(discount || 0);

    // amount auto = baseDebt - discount (clamped)
    const autoAmount = Math.max(baseDebt - disc, 0);

    setAmount((prev) => {
      const prevNum = typeof prev === "number" ? prev : Number(prev || 0);
      if (prev === "" || prevNum === autoAmount || prevNum > baseDebt) {
        return autoAmount;
      }
      return prev;
    });

    const aNum =
      typeof amount === "number" ? amount : Number(amount || autoAmount);

    const newDebt = Math.max(baseDebt - aNum - disc, 0);
    setDebt((prev) => (prev === newDebt ? prev : newDebt));
  }, [plan, amount, discount, selectedClientDebt]);

  // === preseleccionar cliente cuando viene desde el detalle ==========
  useEffect(() => {
    if (preselectedClientId) {
      handleClientChange(preselectedClientId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedClientId]);

  // Responsive: single calendar month on mobile
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const rangeLabel = useMemo(() => {
    if (!dateRange.from || !dateRange.to)
      return "Seleccioná un rango de fechas";
    const f = dateRange.from.toLocaleDateString("es-AR");
    const t = dateRange.to.toLocaleDateString("es-AR");
    return `Este pago cubre del ${f} al ${t}`;
  }, [dateRange]);

  const canSave =
    !!clientId &&
    !!plan &&
    !!dateRange.from &&
    !!dateRange.to &&
    (Number(amount) > 0 || Number(debt) > 0);

  const handleSave = async () => {
    if (!clientId) {
      alert("Seleccioná un cliente");
      return;
    }
    if (!plan) {
      alert("Seleccioná un plan");
      return;
    }
    if (!periodFrom || !periodTo) {
      alert("Seleccioná desde y hasta cuándo cubre el pago");
      return;
    }

    const numericAmount =
      typeof amount === "number" ? amount : Number(amount || 0);
    const numericDiscount =
      typeof discount === "number" ? discount : Number(discount || 0);
    const numericDebt =
      typeof debt === "number" ? debt : Number(debt || 0);

    setLoading(true);

    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          amount: numericAmount,
          plan,
          discount: numericDiscount,
          debt: numericDebt,
          periodFrom,
          periodTo,
        }),
      });

      if (!res.ok) throw new Error("Error registrando pago");

      onCreated();
      onClose();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Error registrando pago");
    } finally {
      setLoading(false);
    }
  };

  /* ================== HEADER & FOOTER CONFIG ================== */

  const header = (
    <div className="flex items-center gap-p10 w-full justify-start">
      <div className="flex h-8 w-8 items-center justify-center">
        <DollarSign className="h-4 w-4 text-app " />
      </div>
      <h2 className="fs-14 font-semibold">Registrar un nuevo pago</h2>
    </div>
  );

  const secondaryAction = {
    label: "Regresar",
    onClick: onClose,
  };

  const primaryAction = {
    label: loading ? "Guardando..." : "Registrar pago",
    onClick: handleSave,
    disabled: loading || !canSave,
  };

  /* ================== RENDER ================== */

  return (
    <Modal
      size="large"
      onClose={onClose}
      header={header}
      secondaryAction={secondaryAction}
      primaryAction={primaryAction}
    >
      <div className="grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr] gap-p30">
        {/* LEFT: Datos del pago */}
        <div className="flex flex-col gap-p10">
          {/* Cliente */}
          <ClientSearchSelect
            clients={clients}
            selectedClientId={clientId}
            onSelectClient={handleClientChange}
          />

          {/* Plan */}
          <Field label="Plan">
            <select
              className={`w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app appearance-none pr-p30 ${
                hasDebt ? "opacity-70 cursor-not-allowed" : ""
              }`}
              value={plan}
              onChange={(e) => handlePlanChange(e.target.value as PlanType)}
              required
              disabled={hasDebt}
            >
              <option value="">Seleccionar plan...</option>
              {availablePlans.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            {hasDebt && selectedClientDebt > 0 && (
              <p className="fs-12 text-app-secondary mt-p5">
                Deuda actual: $
                {selectedClientDebt.toLocaleString("es-AR", {
                  maximumFractionDigits: 0,
                })}
              </p>
            )}
          </Field>

          {/* Pago */}
          <Field label="Pago">
            <input
              type="number"
              className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app placeholder:text-app-secondary"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value ? Number(e.target.value) : "")
              }
              placeholder="Monto pagado hoy"
              min={0}
            />
          </Field>

          {/* Bonificación */}
          <Field label="Bonificación">
            <input
              type="number"
              className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app placeholder:text-app-secondary"
              value={discount}
              onChange={(e) =>
                setDiscount(e.target.value ? Number(e.target.value) : "")
              }
              placeholder="Descuento aplicado (opcional)"
              min={0}
            />
          </Field>

          {/* Deuda */}
          <Field label="Deuda total después de este pago">
            <input
              type="number"
              className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app placeholder:text-app-secondary"
              value={debt}
              onChange={(e) =>
                setDebt(e.target.value ? Number(e.target.value) : "")
              }
              placeholder="0 si queda saldado"
              min={0}
            />
          </Field>
        </div>

        {/* RIGHT: Calendario */}
        <div className="space-y-p20">
          <RangeCalendar
            value={dateRange}
            onChange={setDateRange}
            disabled={calendarLocked}
            numberOfMonths={isMobile ? 1 : 2}
            markers={markers}
          />

          <p className="fs-14 text-app-secondary text-center">{rangeLabel}</p>

          {calendarLocked && (
            <p className="fs-12 text-app-secondary">
              Este rango pertenece a una deuda previa y no puede modificarse.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ===== Subcomponente Field, mismo patrón que en otros modales ===== */

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
