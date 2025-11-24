"use client"

import React, { useEffect, useState } from "react"
import type { ClientRow, Payment } from "../page"

export default function ClientDetailModal({
  client,
  onClose,
  onChanged,
}: {
  client: ClientRow
  onClose: () => void
  onChanged: () => void
}) {
  const [email, setEmail] = useState(client.email ?? "")
  const [phone, setPhone] = useState(client.phone ?? "")
  const [address, setAddress] = useState(client.address ?? "")
  const [addressNumber, setAddressNumber] = useState(client.addressNumber ?? "")

  const [payments, setPayments] = useState<Payment[]>([])
  const [loadingPayments, setLoadingPayments] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const loadPayments = async () => {
      setLoadingPayments(true)
      try {
        const res = await fetch(`/api/payments?clientId=${client.id}`)
  
        if (!res.ok) {
          const txt = await res.text()
          console.error("Payments fetch failed:", res.status, txt)
          throw new Error("Error cargando historial")
        }
  
        const data: Payment[] = await res.json()
        setPayments(data)
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingPayments(false)
      }
    }
  
    loadPayments()
  }, [client.id])
  

  const handleSave = async () => {
    setSaving(true)
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
      })

      if (!res.ok) throw new Error("Error guardando cambios")

      onChanged()
      onClose()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : "Error guardando cambios")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("¿Eliminar este cliente y todo su historial de pagos?")) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/clients/${client.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Error eliminando cliente")

      onChanged()
      onClose()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : "Error eliminando cliente")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5 text-sm p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold mb-1">Detalle de cliente</h2>
          <p className="text-xs text-slate-500">
            Podés editar datos de contacto y vencimiento.
          </p>
        </div>

        <button
          onClick={handleDelete}
          className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          disabled={deleting}
        >
          {deleting ? "Eliminando..." : "Eliminar cliente"}
        </button>
      </div>

      {/* Datos del cliente */}
      <div className="rounded-md border bg-slate-50 p-3 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium">
            Nombre (no editable)
          </label>
          <input
            value={client.name}
            readOnly
            className="w-full rounded-md border bg-slate-100 px-3 py-2 text-sm text-slate-700"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">Email</label>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">
            Número de teléfono
          </label>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">Domicilio</label>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">
            Número / piso / depto
          </label>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={addressNumber}
            onChange={(e) => setAddressNumber(e.target.value)}
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={saving}
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>

     {/* Historial de pagos */}
<div>
  <h3 className="mb-2 text-sm font-semibold">Historial de pagos</h3>

  <div className="max-h-64 overflow-auto rounded-md border">
    {loadingPayments ? (
      <div className="p-4 text-xs text-slate-500">
        Cargando historial...
      </div>
    ) : payments.length === 0 ? (
      <div className="p-4 text-xs text-slate-500">
        Este cliente aún no tiene pagos registrados.
      </div>
    ) : (
      <table className="min-w-full text-xs">
        <thead className="bg-slate-100 text-slate-500">
          <tr>
            <th className="py-2 px-2 text-left">Fecha</th>
            <th className="py-2 px-2 text-left">Plan</th>
            <th className="py-2 px-2 text-right">Pago</th>
            <th className="py-2 px-2 text-right">Bonificación</th>
            <th className="py-2 px-2 text-right">Deuda</th>
            <th className="py-2 px-2 text-left">Desde</th>
            <th className="py-2 px-2 text-left">Hasta</th>
          </tr>
        </thead>

        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="py-2 px-2">
                {new Date(p.created_at).toLocaleDateString("es-AR")}
              </td>
              <td className="py-2 px-2">{p.plan ?? "—"}</td>
              <td className="py-2 px-2 text-right">
                {"$" +
                  (p.amount ?? 0).toLocaleString("es-AR", {
                    maximumFractionDigits: 0,
                  })}
              </td>
              <td className="py-2 px-2 text-right">
                {p.discount != null && p.discount > 0
                  ? "$" +
                    p.discount.toLocaleString("es-AR", {
                      maximumFractionDigits: 0,
                    })
                  : "—"}
              </td>
              <td className="py-2 px-2 text-right">
                {p.debt != null
                  ? "$" +
                    p.debt.toLocaleString("es-AR", {
                      maximumFractionDigits: 0,
                    })
                  : "—"}
              </td>
              <td className="py-2 px-2">
                {p.period_from
                  ? new Date(p.period_from).toLocaleDateString("es-AR")
                  : "—"}
              </td>
              <td className="py-2 px-2">
                {p.period_to
                  ? new Date(p.period_to).toLocaleDateString("es-AR")
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
</div>

    </div>
  )
}
