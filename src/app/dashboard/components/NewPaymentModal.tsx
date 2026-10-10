"use client"

import React, { useEffect, useMemo, useState } from "react"
import type { ClientRow, PlanType } from "../page"
import { PLANS } from "../page"
import RangeCalendar, { type DateRangeValue } from "./RangeCalendar"
import ClientSearchSelect from "./ClientSearchSelect"
import Modal from "./Modal"
import { DollarSign } from "react-feather"
import type { Currency, PaymentType } from "@/lib/payments/types"
import { formatPaymentMoney } from "@/lib/payments/format"

type Props = {
  clients: ClientRow[]
  onClose: () => void
  onCreated: () => void
  preselectedClientId?: string
  onSuccess?: (msg: string) => void
  onError?: (msg: string) => void
}

type PaymentRow = {
  id: string
  amount: number
  plan: string | null
  discount: number | null
  debt: number | null
  period_from: string | null
  period_to: string | null
  created_at: string
}

const toISO = (d?: Date) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : ""

const parseISO = (s?: string | null) =>
  s ? new Date(s + "T00:00:00") : undefined

export default function NewPaymentModal({
  clients,
  onClose,
  onCreated,
  preselectedClientId,
  onSuccess,
  onError,
}: Props) {
  const [clientId, setClientId] = useState(preselectedClientId ?? "")
  const [plan, setPlan] = useState<PlanType | "">("")
  const [amount, setAmount] = useState<number | "">("")
  const [discount, setDiscount] = useState<number | "">("")
  const [debt, setDebt] = useState<number | "">("")
  const [loading, setLoading] = useState(false)
  const [paymentType, setPaymentType] = useState<PaymentType>("recurring")
  const [currency, setCurrency] = useState<Currency>("ARS")
  const [concept, setConcept] = useState("")
  const [serviceDate, setServiceDate] = useState("")
  const [receiptNote, setReceiptNote] = useState("")

  const [selectedClientDebt, setSelectedClientDebt] = useState(0)
  const [isMobile, setIsMobile] = useState(false)

  const [markers, setMarkers] = useState<Record<string, "paid" | "debt">>({})

  const [dateRange, setDateRange] = useState<DateRangeValue>({})
  const [calendarLocked, setCalendarLocked] = useState(false)

  const periodFrom = toISO(dateRange.from)
  const periodTo = toISO(dateRange.to)

  const selectedClient = clients.find((c) => c.id === clientId)
  const hasDebt = paymentType === "recurring" && (selectedClient?.currentDebt ?? 0) > 0
  const availablePlans = useMemo(
    () => (hasDebt ? PLANS : PLANS.filter((p) => p !== "Pago deuda")),
    [hasDebt]
  )

  const handleClientChange = async (id: string, type: PaymentType = paymentType) => {
    setClientId(id)

    const c = clients.find((cl) => cl.id === id)
    setCurrency(c?.currency ?? "ARS")
    const d = c ? Number(c.currentDebt || 0) : 0
    setSelectedClientDebt(d)

    let pays: PaymentRow[] = []

    try {
      const res = await fetch(`/api/payments?clientId=${id}`)
      if (res.status === 401) { window.location.href = "/login"; return }
      if (res.ok) {
        pays = await res.json()
      }
    } catch (e) {
      console.log("No pude cargar pagos del cliente:", e)
    }

    const nextMarkers: Record<string, "paid" | "debt"> = {}

    pays.forEach((p) => {
      if (!p.period_from || !p.period_to) return

      const from = new Date(p.period_from + "T00:00:00")
      const to = new Date(p.period_to + "T00:00:00")

      for (let t = new Date(from); t <= to; t.setDate(t.getDate() + 1)) {
        const key = t.toISOString().slice(0, 10)
        nextMarkers[key] = Number(p.debt || 0) > 0 ? "debt" : "paid"
      }
    })

    if (d === 0) {
      for (const key in nextMarkers) {
        nextMarkers[key] = "paid"
      }
    }

    setMarkers(nextMarkers)

    if (d > 0 && type === "recurring") {
      setPlan("Pago deuda")
      setDiscount(0)

      const withDebt = pays.filter((p) => Number(p.debt || 0) > 0)
      const lastDebt = withDebt.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0]

      if (lastDebt?.period_from && lastDebt?.period_to) {
        const from = parseISO(lastDebt.period_from)
        const to = parseISO(lastDebt.period_to)

        setDateRange({ from, to })
        setCalendarLocked(true)
        setAmount(d)
        setDebt(0)
        return
      }

      setCalendarLocked(false)
      setDateRange({})
      setAmount(d)
      setDebt(0)
    } else {
      setCalendarLocked(false)
      setPlan("")
      setAmount("")
      setDiscount("")
      setDebt("")
      setDateRange({})
    }
  }

  const handlePlanChange = (value: PlanType) => {
    if (hasDebt) return
    setPlan(value)
  }

  useEffect(() => {
    if (paymentType !== "recurring" || plan !== "Pago deuda") return

    const baseDebt = selectedClientDebt || 0
    const disc =
      typeof discount === "number" ? discount : Number(discount || 0)

    const autoAmount = Math.max(baseDebt - disc, 0)

    setAmount((prev) => {
      const prevNum = typeof prev === "number" ? prev : Number(prev || 0)
      if (prev === "" || prevNum === autoAmount || prevNum > baseDebt) {
        return autoAmount
      }
      return prev
    })

    const aNum =
      typeof amount === "number" ? amount : Number(amount || autoAmount)

    const newDebt = Math.max(baseDebt - aNum - disc, 0)
    setDebt((prev) => (prev === newDebt ? prev : newDebt))
  }, [plan, amount, discount, selectedClientDebt, paymentType])

  useEffect(() => {
    if (preselectedClientId) {
      handleClientChange(preselectedClientId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedClientId])

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const rangeLabel = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return "Selecciona un rango de fechas"
    const f = dateRange.from.toLocaleDateString("es-AR")
    const t = dateRange.to.toLocaleDateString("es-AR")
    return `Este pago cubre del ${f} al ${t}`
  }, [dateRange])

  const canSave =
    !!clientId &&
    (paymentType === "one_off" ? !!concept.trim() : !!(plan || concept.trim()) && !!dateRange.from && !!dateRange.to) &&
    (Number(amount) > 0 || Number(debt) > 0)

  const handleSave = async () => {
    if (!clientId) {
      onError?.("Selecciona un cliente")
      return
    }
    if (!concept.trim() && !plan) {
      onError?.("Indicá un concepto o seleccioná un plan")
      return
    }
    if (paymentType === "recurring" && (!periodFrom || !periodTo)) {
      onError?.("Selecciona desde y hasta cuando cubre el pago")
      return
    }

    const numericAmount =
      typeof amount === "number" ? amount : Number(amount || 0)
    const numericDiscount =
      typeof discount === "number" ? discount : Number(discount || 0)
    const numericDebt = typeof debt === "number" ? debt : Number(debt || 0)

    setLoading(true)

    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          amount: numericAmount,
          plan,
          provider: "manual",
          paymentType,
          currency,
          concept: concept.trim() || undefined,
          serviceDate: paymentType === "one_off" ? serviceDate || undefined : undefined,
          receiptNote: receiptNote.trim() || undefined,
          discount: numericDiscount,
          debt: paymentType === "one_off" && debt === "" ? undefined : numericDebt,
          periodFrom: paymentType === "recurring" ? periodFrom : undefined,
          periodTo: paymentType === "recurring" ? periodTo : undefined,
        }),
      })

      if (res.status === 401) { window.location.href = "/login"; return }
      const result = await res.json()
      if (!res.ok) throw new Error(result.error ?? "Error registrando pago")

      onCreated()
      onSuccess?.(
        result.receipt_status === "sent" || result.receipt_status === "already_recorded"
          ? "Pago registrado. Comprobante enviado al proveedor de email."
          : "Pago registrado. El comprobante no se pudo confirmar; revisá el historial."
      )
      onClose()
    } catch (err) {
      console.error(err)
      onError?.(
        err instanceof Error ? err.message : "Error registrando pago"
      )
    } finally {
      setLoading(false)
    }
  }

  const header = (
    <div className="flex items-center gap-p10 w-full justify-start">
      <div className="flex h-8 w-8 items-center justify-center">
        <DollarSign className="h-4 w-4 text-app " />
      </div>
      <h2 className="fs-14 font-semibold">Registrar un nuevo pago</h2>
    </div>
  )

  const secondaryAction = {
    label: "Regresar",
    onClick: onClose,
  }

  const primaryAction = {
    label: loading ? "Guardando..." : "Registrar pago",
    onClick: handleSave,
    disabled: loading || !canSave,
  }

  return (
    <Modal
      size="large"
      onClose={onClose}
      header={header}
      secondaryAction={secondaryAction}
      primaryAction={primaryAction}
    >
      <div className="grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr] gap-p30">
        <div className="flex flex-col gap-p10">
          <ClientSearchSelect
            clients={clients}
            selectedClientId={clientId}
            onSelectClient={handleClientChange}
          />

          <Field label="Tipo de pago">
            <select className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" value={paymentType}
              onChange={e => {
                const type = e.target.value as PaymentType
                setPaymentType(type)
                setPlan(""); setDateRange({}); setCalendarLocked(false); setAmount(""); setDebt("")
                if (clientId) void handleClientChange(clientId, type)
              }}>
              <option value="recurring">Recurrente</option>
              <option value="one_off">Único</option>
            </select>
          </Field>
          <Field label="Moneda">
            <select className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" value={currency}
              disabled={Boolean(selectedClient?.hasPayments || selectedClient?.currentDebt)} onChange={e => setCurrency(e.target.value as Currency)}>
              <option value="ARS">ARS — Peso argentino</option>
              <option value="AUD">AUD — Dólar australiano</option>
            </select>
          </Field>
          <Field label="Concepto">
            <input className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" value={concept}
              onChange={e => setConcept(e.target.value)} maxLength={200} placeholder="Ej. Servicio mensual o cena de fin de año" />
          </Field>
          {paymentType === "recurring" && <Field label="Plan (opcional si indicás concepto)">
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
                Deuda actual: {formatPaymentMoney(selectedClientDebt, currency)}
              </p>
            )}
          </Field>}

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

          <Field label="Bonificacion">
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

          <Field label="Deuda total despues de este pago">
            <input
              type="number"
              className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app placeholder:text-app-secondary"
              value={debt}
              onChange={(e) =>
                setDebt(e.target.value ? Number(e.target.value) : "")
              }
              placeholder={paymentType === "one_off" ? "Vacío conserva la deuda actual" : "0 si queda saldado"}
              min={0}
            />
          </Field>
          <Field label="Nota del comprobante (opcional)">
            <textarea className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" rows={3}
              maxLength={1000} value={receiptNote} onChange={e => setReceiptNote(e.target.value)} placeholder="Ej. Mesa para dos personas" />
          </Field>
        </div>

        <div className="space-y-p20">
          {paymentType === "recurring" ? <>
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
          </> : <Field label="Fecha del servicio / evento (opcional)">
            <input type="date" className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" value={serviceDate}
              onChange={e => setServiceDate(e.target.value)} min="1900-01-01" max="9999-12-31" />
          </Field>}
        </div>
      </div>
    </Modal>
  )
}

type FieldProps = {
  label: string
  children: React.ReactNode
}

function Field({ label, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-p5">
      <label className="fs-12 text-app-secondary">{label}</label>
      {children}
    </div>
  )
}
