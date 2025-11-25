"use client"

import React, { useEffect, useMemo, useState } from "react"
import type { ClientRow, PlanType } from "../page"
import { PLANS } from "../page"
import RangeCalendar, { type DateRangeValue } from "./RangeCalendar"
import ClientSearchSelect from "./ClientSearchSelect"

type Props = {
  clients: ClientRow[]
  onClose: () => void
  onCreated: () => void
  preselectedClientId?: string
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
    ? new Date(d.getFullYear(), d.getMonth(), d.getDate())
        .toISOString()
        .slice(0, 10)
    : ""

const parseISO = (s?: string | null) =>
  s ? new Date(s + "T00:00:00") : undefined

export default function NewPaymentModal({
  clients,
  onClose,
  onCreated,
  preselectedClientId,
}: Props) {
  const [clientId, setClientId] = useState(preselectedClientId ?? "")
  const [plan, setPlan] = useState<PlanType | "">("")
  const [amount, setAmount] = useState<number | "">("")
  const [discount, setDiscount] = useState<number | "">("")
  const [debt, setDebt] = useState<number | "">("")
  const [loading, setLoading] = useState(false)

  const [selectedClientDebt, setSelectedClientDebt] = useState(0)

  // markers para el calendario (pagado / deuda)
  const [markers, setMarkers] = useState<Record<string, "paid" | "debt">>({})

  // === Range calendar
  const [dateRange, setDateRange] = useState<DateRangeValue>({})
  const [calendarLocked, setCalendarLocked] = useState(false)

  // derived ISO for submit
  const periodFrom = toISO(dateRange.from)
  const periodTo = toISO(dateRange.to)

  const selectedClient = clients.find((c) => c.id === clientId)
  const hasDebt = (selectedClient?.currentDebt ?? 0) > 0

  const handleClientChange = async (id: string) => {
    setClientId(id)

    const c = clients.find((cl) => cl.id === id)
    const d = c ? Number(c.currentDebt || 0) : 0
    setSelectedClientDebt(d)

    // --- 1) Traer TODOS los pagos del cliente (tenga o no deuda) ---
    let pays: PaymentRow[] = []

    try {
      const res = await fetch(`/api/payments?clientId=${id}`)
      if (res.ok) {
        pays = await res.json()
      }
    } catch (e) {
      console.log("No pude cargar pagos del cliente:", e)
    }

    // --- 2) Construir markers para el calendario ---
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

    // 👉 Si la deuda actual del cliente es 0, todos los días pasan a "paid" (verde)
    if (d === 0) {
      for (const key in nextMarkers) {
        nextMarkers[key] = "paid"
      }
    }

    setMarkers(nextMarkers)

    // --- 3) Lógica de deuda / bloqueo de calendario ---
    if (d > 0) {
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

        // amount should start as full debt (then discount reduces it)
        setAmount(d)
        setDebt(0)
        return
      }

      // fallback si hay deuda pero no encontramos período
      setCalendarLocked(false)
      setDateRange({})
      setAmount(d)
      setDebt(0)
    } else {
      // no hay deuda: todo editable, sin rango preseleccionado
      setCalendarLocked(false)
      setPlan("")
      setAmount("")
      setDiscount("")
      setDebt("")
      setDateRange({})
    }
  }

  const handlePlanChange = (value: PlanType) => {
    if (hasDebt) return // locked
    setPlan(value)
  }

  // === descuento recalcula amount y deuda (solo Pago deuda) ==========
  useEffect(() => {
    if (plan !== "Pago deuda") return

    const baseDebt = selectedClientDebt || 0
    const disc =
      typeof discount === "number" ? discount : Number(discount || 0)

    // amount auto = baseDebt - discount (clamped)
    const autoAmount = Math.max(baseDebt - disc, 0)

    setAmount((prev) => {
      const prevNum =
        typeof prev === "number" ? prev : Number(prev || 0)
      if (prev === "" || prevNum === autoAmount || prevNum > baseDebt) {
        return autoAmount
      }
      return prev
    })

    const aNum =
      typeof amount === "number" ? amount : Number(amount || autoAmount)

    const newDebt = Math.max(baseDebt - aNum - disc, 0)
    setDebt((prev) => (prev === newDebt ? prev : newDebt))
  }, [plan, amount, discount, selectedClientDebt])

  // === preseleccionar cliente cuando viene desde el detalle ==========
  useEffect(() => {
    if (preselectedClientId) {
      handleClientChange(preselectedClientId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedClientId])

  const rangeLabel = useMemo(() => {
    if (!dateRange.from || !dateRange.to)
      return "Seleccioná un rango de fechas"
    const f = dateRange.from.toLocaleDateString("es-AR")
    const t = dateRange.to.toLocaleDateString("es-AR")
    return `Este pago cubre del ${f} al ${t}`
  }, [dateRange])

  const canSave =
    !!clientId &&
    !!plan &&
    !!dateRange.from &&
    !!dateRange.to &&
    (Number(amount) > 0 || Number(debt) > 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!clientId) return alert("Seleccioná un cliente")
    if (!plan) return alert("Seleccioná un plan")
    if (!periodFrom || !periodTo) {
      return alert("Seleccioná desde y hasta cuándo cubre el pago")
    }

    const numericAmount =
      typeof amount === "number" ? amount : Number(amount || 0)
    const numericDiscount =
      typeof discount === "number" ? discount : Number(discount || 0)
    const numericDebt =
      typeof debt === "number" ? debt : Number(debt || 0)

    setLoading(true)

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
      })

      if (!res.ok) throw new Error("Error registrando pago")

      onCreated()
      onClose()
    } catch (err) {
      console.error(err)
      alert(
        err instanceof Error ? err.message : "Error registrando pago"
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="text-sm">
      {/* HEADER */}
      <div className="px-6 py-5 border-b bg-white">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Registrar un nuevo pago
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Seleccioná el período y completá la facturación.
            </p>
          </div>
        </div>
      </div>

      {/* BODY: Inputs izquierda / Calendar derecha */}
      <div className="grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr]">
        {/* LEFT: Inputs */}
        <div className="p-6 bg-white">
          <div className="space-y-6">
            {/* Persona */}
            <ClientSearchSelect
              clients={clients}
              selectedClientId={clientId}
              onSelectClient={handleClientChange}
            />

            {/* Plan */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-900">
                Plan
              </label>
              <select
                className={`w-full rounded-md border border-slate-300 px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${
                  hasDebt ? "opacity-70 cursor-not-allowed" : ""
                }`}
                value={plan}
                onChange={(e) =>
                  handlePlanChange(e.target.value as PlanType)
                }
                required
                disabled={hasDebt}
              >
                <option value="">Seleccionar plan...</option>
                {PLANS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              {hasDebt && selectedClientDebt > 0 && (
                <p className="text-xs text-slate-500">
                  Deuda actual: $
                  {selectedClientDebt.toLocaleString("es-AR", {
                    maximumFractionDigits: 0,
                  })}
                </p>
              )}
            </div>

            {/* Pago */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-900">
                Pago
              </label>
              <input
                type="number"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value ? Number(e.target.value) : "")
                }
                placeholder="Monto pagado hoy"
                min={0}
                required
              />
            </div>

            {/* Bonificación */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-900">
                Bonificación
              </label>
              <input
                type="number"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                value={discount}
                onChange={(e) =>
                  setDiscount(
                    e.target.value ? Number(e.target.value) : ""
                  )
                }
                placeholder="Descuento aplicado (opcional)"
                min={0}
              />
            </div>

            {/* Deuda */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-900">
                Deuda total después de este pago
              </label>
              <input
                type="number"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                value={debt}
                onChange={(e) =>
                  setDebt(e.target.value ? Number(e.target.value) : "")
                }
                placeholder="0 si queda saldado"
                min={0}
              />
            </div>
          </div>
        </div>

        {/* RIGHT: Calendar */}
        <div className="p-6 bg-white md:border-l border-t md:border-t-0">
          <RangeCalendar
            value={dateRange}
            onChange={setDateRange}
            disabled={calendarLocked}
            numberOfMonths={2}
            markers={markers}
          />

          <p className="mt-4 text-sm text-slate-700">{rangeLabel}</p>

          {calendarLocked && (
            <p className="mt-1 text-xs text-slate-500">
              Este rango pertenece a una deuda previa y no puede
              modificarse.
            </p>
          )}
        </div>
      </div>

      {/* FOOTER */}
      <div className="px-6 py-4 border-t bg-white flex items-center justify-between gap-3">
        <p className="text-sm text-slate-700">{rangeLabel}</p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm hover:bg-slate-50"
          >
            Cancelar
          </button>

          <button
            type="submit"
            disabled={!canSave || loading}
            className="rounded-md bg-slate-700 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Guardando..." : "Guardar pago"}
          </button>
        </div>
      </div>
    </form>
  )
}
