"use client"

import React, { useEffect, useMemo, useState } from "react"
import type { ClientRow, PlanType } from "../page"
import { PLANS } from "../page"
import RangeCalendar, { type DateRangeValue } from "./RangeCalendar"
import ClientSearchSelect from "./ClientSearchSelect"
import Modal from "./Modal"
import { DollarSign } from "react-feather"
import { FREQUENCY_LABELS, RECURRING_FREQUENCIES, frequencyFromInterval, getRecurringPeriod, formatPaymentPeriod, toCalendarDate, fromCalendarDate, type RecurringFrequency } from "@/lib/payments/schedule"
import type { PaymentType, RecurringAgreementSummary } from "@/lib/payments/types"
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
  payment_type?: PaymentType | null
  provider?: string
  next_payment_date?: string | null
  recurring_agreement?: RecurringAgreementSummary | null
  amount: number
  plan: string | null
  discount: number | null
  debt: number | null
  period_from: string | null
  period_to: string | null
  created_at: string
}

const toISO = toCalendarDate
const parseISO = fromCalendarDate

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
  const [concept, setConcept] = useState("")
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly")
  const [cycleDate, setCycleDate] = useState("")
  const [agreement, setAgreement] = useState<RecurringAgreementSummary | null>(null)
  const [debtPaymentId, setDebtPaymentId] = useState<string | null>(null)
  const [receiptNote, setReceiptNote] = useState("")

  const [selectedClientDebt, setSelectedClientDebt] = useState(0)
  const [isMobile, setIsMobile] = useState(false)

  const [markers, setMarkers] = useState<Record<string, "paid" | "debt">>({})

  const [dateRange, setDateRange] = useState<DateRangeValue>({})
  const [calendarLocked, setCalendarLocked] = useState(false)

  const periodFrom = toISO(dateRange.from)
  const periodTo = toISO(dateRange.to ?? dateRange.from)

  const selectedClient = clients.find((c) => c.id === clientId)
  const hasDebt = paymentType === "recurring" && (selectedClient?.currentDebt ?? 0) > 0
  const availablePlans = useMemo(
    () => (hasDebt ? PLANS : PLANS.filter((p) => p !== "Pago deuda")),
    [hasDebt]
  )

  const handleClientChange = async (id: string, type: PaymentType = paymentType) => {
    setClientId(id)
    setDebtPaymentId(null); setAgreement(null); setCycleDate(""); setFrequency("monthly")

    const c = clients.find((cl) => cl.id === id)
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
        const key = toISO(t)
        nextMarkers[key] = Number(p.debt || 0) > 0 ? "debt" : "paid"
      }
    })

    if (d === 0) {
      for (const key in nextMarkers) {
        nextMarkers[key] = "paid"
      }
    }

    setMarkers(nextMarkers)
    const currentAgreement = pays.find(p => p.provider === "manual" && p.recurring_agreement?.status === "active" && p.recurring_agreement.billing_anchor_date)?.recurring_agreement ?? null
    if (type === "recurring" && currentAgreement) {
      const currentFrequency = frequencyFromInterval(currentAgreement.interval_unit,currentAgreement.interval_count)
      if (currentFrequency) {
        setAgreement(currentAgreement);setFrequency(currentFrequency)
        setCycleDate(currentAgreement.next_charge_at?.slice(0,10) ?? "")
      }
    } else if (type === "recurring") setCycleDate(c?.nextDue ?? "")

    if (d > 0 && type === "recurring") {
      setPlan("Pago deuda")
      setDiscount(0)

      const withDebt = pays.filter((p) => p.payment_type !== "one_off" && Number(p.debt || 0) > 0)
      const lastDebt = withDebt.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0]

      if (lastDebt) {
        setDebtPaymentId(lastDebt.id)
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

  const rangeLabel = formatPaymentPeriod(periodFrom || null,periodTo || null)
  const schedulePreview = useMemo(() => {
    if (!cycleDate || debtPaymentId) return null
    try { return getRecurringPeriod({frequency,anchorDate:agreement?.billing_anchor_date ?? cycleDate,cycleDate}) } catch { return null }
  }, [cycleDate,frequency,agreement,debtPaymentId])

  const canSave =
    !!clientId &&
    (paymentType === "one_off" ? !!concept.trim() : Boolean(debtPaymentId || schedulePreview)) &&
    (Number(amount) > 0 || Number(debt) > 0)

  const handleSave = async () => {
    if (!clientId) {
      onError?.("Selecciona un cliente")
      return
    }
    if (paymentType === "one_off" && !concept.trim()) {
      onError?.("Indicá un concepto o seleccioná un plan")
      return
    }
    if (paymentType === "recurring" && !debtPaymentId && !schedulePreview) {
      onError?.("Seleccioná un vencimiento válido para la frecuencia")
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
          concept: concept.trim() || undefined,
          frequency: paymentType === "recurring" && !debtPaymentId ? frequency : undefined,
          anchorDate: paymentType === "recurring" && !debtPaymentId ? agreement?.billing_anchor_date ?? cycleDate : undefined,
          cycleDate: paymentType === "recurring" && !debtPaymentId ? cycleDate : undefined,
          recurringAgreementId: paymentType === "recurring" && !debtPaymentId ? agreement?.id : undefined,
          debtPaymentId: paymentType === "recurring" ? debtPaymentId || undefined : undefined,
          receiptNote: receiptNote.trim() || undefined,
          discount: numericDiscount,
          debt: paymentType === "recurring" ? numericDebt : undefined,
          periodFrom: paymentType === "one_off" ? periodFrom || undefined : undefined,
          periodTo: paymentType === "one_off" ? periodTo || undefined : undefined,
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
              <option value="one_off">Pago único</option>
            </select>
          </Field>
          {paymentType === "recurring" && <Field label="Frecuencia">
            <select className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" value={frequency}
              disabled={Boolean(agreement || calendarLocked)} onChange={e => setFrequency(e.target.value as RecurringFrequency)}>
              {RECURRING_FREQUENCIES.map(f => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
            </select>
          </Field>}
          <Field label={paymentType === "one_off" ? "Concepto" : "Concepto (opcional)"}>
            <input className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" value={concept}
              onChange={e => setConcept(e.target.value)} maxLength={200} placeholder="Ej. Servicio mensual o cena de fin de año" />
          </Field>
          {paymentType === "recurring" && <Field label="Plan (opcional)">
            <select
              className={`w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app appearance-none pr-p30 ${
                hasDebt ? "opacity-70 cursor-not-allowed" : ""
              }`}
              value={plan}
              onChange={(e) => handlePlanChange(e.target.value as PlanType)}
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
                Deuda actual: {formatPaymentMoney(selectedClientDebt, selectedClient?.currency)}
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

          {paymentType === "recurring" && <Field label="Deuda total despues de este pago">
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
          </Field>}
          <Field label="Nota del comprobante (opcional)">
            <textarea className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app" rows={3}
              maxLength={1000} value={receiptNote} onChange={e => setReceiptNote(e.target.value)} placeholder="Ej. Mesa para dos personas" />
          </Field>
        </div>

        <div className="space-y-p20">
          {paymentType === "recurring" ? <>
            <Field label={calendarLocked ? "Período de la deuda" : agreement ? "Vencimiento del ciclo" : "Primer vencimiento"}>
              <RangeCalendar key={`${clientId}:${debtPaymentId ?? cycleDate}`} selectionMode={calendarLocked ? "range" : "single"}
                value={calendarLocked ? dateRange : {from:parseISO(cycleDate)}}
                recurrence={schedulePreview ? {frequency,anchorDate:agreement?.billing_anchor_date ?? cycleDate} : undefined}
                onChange={next => setCycleDate(toISO(next.from))} disabled={calendarLocked}
                numberOfMonths={isMobile ? 1 : 2} markers={markers} />
            </Field>
            {calendarLocked ? <p className="fs-14 text-app-secondary text-center">{rangeLabel ? `Período: ${rangeLabel}` : "Deuda de un pago anterior"}. Su vencimiento se conserva.</p>
              : schedulePreview ? <p className="fs-14 text-app-secondary text-center">Período: {formatPaymentPeriod(schedulePreview.periodFrom,schedulePreview.periodTo)}. Próximo vencimiento: {formatPaymentPeriod(schedulePreview.nextPaymentDate,schedulePreview.nextPaymentDate)}.</p>
              : <p className="fs-14 text-app-secondary text-center">{cycleDate ? "Elegí una fecha correspondiente a esta recurrencia" : "Seleccioná el primer vencimiento"}</p>}
          </> : <Field label="Período del servicio / evento (opcional)">
            <RangeCalendar selectionMode="range" value={dateRange} onChange={setDateRange}
              numberOfMonths={isMobile ? 1 : 2} markers={markers} />
            <p className="fs-14 text-app-secondary text-center">{rangeLabel ? `Período: ${rangeLabel}` : "Seleccioná un día o un rango si corresponde"}</p>
            {dateRange.from && <button type="button" className="btn-secondary" onClick={() => setDateRange({})}>Quitar período</button>}
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
