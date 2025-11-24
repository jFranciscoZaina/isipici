"use client"

import React, { useEffect, useMemo, useState } from "react"
import type { ClientRow, PlanType } from "../page"
import { PLANS } from "../page"
import RangeCalendar, { type NativeDateRange } from "./RangeCalendar"

type Props = {
  clients: ClientRow[]
  onClose: () => void
  onCreated: () => void
}

export default function NewPaymentModal({ clients, onClose, onCreated }: Props) {
  const [clientId, setClientId] = useState("")
  const [plan, setPlan] = useState<PlanType | "">("")
  const [amount, setAmount] = useState<number | "">("")
  const [discount, setDiscount] = useState<number | "">("")
  const [debt, setDebt] = useState<number | "">("")
  const [loading, setLoading] = useState(false)

  const [selectedClientDebt, setSelectedClientDebt] = useState(0)

  // === Range calendar state (nativo, sin librerías)
  const [dateRange, setDateRange] = useState<NativeDateRange | undefined>({
    from: new Date(),
    to: undefined,
  })

  // Helpers date -> ISO yyyy-mm-dd
  const toISODate = (d?: Date) =>
    d
      ? new Date(d.getFullYear(), d.getMonth(), d.getDate())
          .toISOString()
          .slice(0, 10)
      : ""

  const periodFrom = toISODate(dateRange?.from)
  const periodTo = toISODate(dateRange?.to)

  const handleClientChange = (id: string) => {
    setClientId(id)
    const c = clients.find((cl) => cl.id === id)
    const d = c ? Number(c.currentDebt || 0) : 0

    setSelectedClientDebt(d)

    if (d > 0) {
      setPlan("Pago deuda")
      setAmount(d)
      setDiscount(0)
      setDebt(0)
    } else {
      setPlan("")
      setAmount("")
      setDiscount("")
      setDebt("")
    }
  }

  const handlePlanChange = (value: PlanType) => {
    setPlan(value)
    if (value === "Pago deuda" && selectedClientDebt > 0) {
      setAmount(selectedClientDebt)
      setDebt(0)
    }
  }

  // Recalcular deuda cuando se modifica monto/bonificación en Pago deuda
  useEffect(() => {
    if (plan !== "Pago deuda") return

    const baseDebt = selectedClientDebt || 0
    const a = typeof amount === "number" ? amount : Number(amount || 0)
    const d = typeof discount === "number" ? discount : Number(discount || 0)

    const newDebt = Math.max(baseDebt - a - d, 0)
    setDebt((prev) => (prev === newDebt ? prev : newDebt))
  }, [plan, amount, discount, selectedClientDebt])

  const rangeLabel = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to)
      return "Seleccioná un rango en el calendario"
    const f = dateRange.from.toLocaleDateString("es-AR")
    const t = dateRange.to.toLocaleDateString("es-AR")
    return `Este pago cubre del ${f} al ${t}`
  }, [dateRange])

  const canSave =
    !!clientId &&
    !!plan &&
    !!dateRange?.from &&
    !!dateRange?.to &&
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
      alert(err instanceof Error ? err.message : "Error registrando pago")
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
              Seleccioná el período en el calendario y completá la facturación.
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
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-900">
                Persona
              </label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                value={clientId}
                onChange={(e) => handleClientChange(e.target.value)}
                required
              >
                <option value="">Seleccionar cliente...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.email ? `— ${c.email}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Plan */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-900">
                Plan
              </label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                value={plan}
                onChange={(e) =>
                  handlePlanChange(e.target.value as PlanType)
                }
                required
              >
                <option value="">Seleccionar plan...</option>
                {PLANS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              {plan === "Pago deuda" && selectedClientDebt > 0 && (
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
                  setDiscount(e.target.value ? Number(e.target.value) : "")
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
            numberOfMonths={2}
          />

          <p className="mt-4 text-sm text-slate-700">{rangeLabel}</p>
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
