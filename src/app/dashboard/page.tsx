"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import TopBar from "./components/TopBar" // <- si después no lo usamos, lo podés borrar
import SearchBar from "./components/SearchBar"
import StatsGrid from "./components/StatsGrid"
import ClientsTable from "./components/ClientsTable"
import Modal from "./components/Modal"
import NewClientModal from "./components/NewClientModal"
import NewPaymentModal from "./components/NewPaymentModal"
import ClientDetailModal from "./components/ClientDetailModal"

// === TYPES =======================================================================

export type ClientRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  addressNumber: string | null
  currentPlan: string | null
  currentDebt: number
  totalPaidThisMonth: number
  nextDue: string | null
  isMonthFullyPaid: boolean
}

export type Payment = {
  id: string
  amount: number
  plan: string | null
  discount: number | null
  debt: number | null
  next_payment_date: string | null
  period_from: string | null
  period_to: string | null
  created_at: string
}

export const PLANS = ["Basic", "Fitness", "Pro fitness", "Pago deuda"] as const
export type PlanType = (typeof PLANS)[number]

// === ROOT DASHBOARD ===============================================================

export default function DashboardPage() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showNewClient, setShowNewClient] = useState(false)

  // Modal de pago
  const [isNewPaymentOpen, setIsNewPaymentOpen] = useState(false)
  const [paymentClientId, setPaymentClientId] = useState<string | undefined>()

  // Modal de detalle
  const [detailClient, setDetailClient] = useState<ClientRow | null>(null)

  const [searchTerm, setSearchTerm] = useState("")
  const [sortKey, setSortKey] = useState<
    "name" | "plan" | "paid" | "debt" | "due"
  >("name")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const [status, setStatus] = useState<"active" | "inactive">("active")

  // Helpers para el modal de pago
  const openNewPayment = (clientId?: string) => {
    setPaymentClientId(clientId)
    setIsNewPaymentOpen(true)
  }

  const closeNewPayment = () => {
    setIsNewPaymentOpen(false)
    setPaymentClientId(undefined)
  }

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/clients?status=${status}`)
      if (!res.ok) throw new Error("Error cargando clientes")
      const data: ClientRow[] = await res.json()
      setClients(data)
      setError(null)
    } catch (e: unknown) {
      console.error(e)
      setError(e instanceof Error ? e.message : "Error inesperado")
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  const stats = useMemo(
    () => ({
      totalClients: clients.length,
      clientsWithDebt: clients.filter((c) => (c.currentDebt ?? 0) > 0).length,
      monthlyIncome: clients.reduce(
        (sum, c) => sum + (c.totalPaidThisMonth || 0),
        0
      ),
    }),
    [clients]
  )

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const sortedClients = useMemo(() => {
    const q = searchTerm.toLowerCase().trim()
    const filtered = clients.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q)
    )

    const dir = sortDir === "asc" ? 1 : -1

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir
        case "plan":
          return (
            (a.currentPlan ?? "").localeCompare(b.currentPlan ?? "") * dir
          )
        case "paid":
          return (
            (a.isMonthFullyPaid ? 1 : 0) - (b.isMonthFullyPaid ? 1 : 0)
          ) * dir
        case "debt":
          return (a.currentDebt - b.currentDebt) * dir
        case "due": {
          const aDue = a.nextDue ? new Date(a.nextDue).getTime() : Infinity
          const bDue = b.nextDue ? new Date(b.nextDue).getTime() : Infinity
          return (aDue - bDue) * dir
        }
        default:
          return 0
      }
    })
  }, [clients, searchTerm, sortKey, sortDir])

  return (
    <div className="min-h-screen bg-slate-200 flex items-stretch justify-center px-4 py-8">
      {/* CONTENEDOR PRINCIPAL (la “card grande” del prototipo) */}
      <div className="w-full max-w-550 rounded-3xl bg-gradient-to-br from-slate-100 via-amber-50/40 to-slate-100 shadow-xl border border-white/60 relative overflow-hidden">
        {/* HEADER: nombre del gym + acciones */}
        <header className="flex items-center justify-between px-8 pt-6 pb-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-semibold text-slate-900">
              Energym
            </h1>
            <span className="h-5 w-px bg-slate-300" />
            <span className="text-xs uppercase tracking-wide text-slate-500">
              dashboard
            </span>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => openNewPayment()}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
            >
              Registrar pago
            </button>
            <button
              onClick={() => setShowNewClient(true)}
              className="rounded-full bg-white/90 px-5 py-2 text-sm font-medium text-slate-900 border border-slate-200 hover:bg-white"
            >
              Agregar cliente
            </button>
          </div>
        </header>

        {/* STATS */}
        <section className="px-8 pb-4">
          <StatsGrid {...stats} />
        </section>

        {/* FILA: Tabs + Buscador + Paginador */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 px-8">

          {/* Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStatus("active")}
              className={`px-5 py-2 rounded-full text-sm font-medium transition ${status === "active"
                  ? "bg-slate-900 text-white shadow-md"
                  : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
                }`}
            >
              Activos
            </button>

            <button
              onClick={() => setStatus("inactive")}
              className={`px-5 py-2 rounded-full text-sm font-medium transition ${status === "inactive"
                  ? "bg-slate-900 text-white shadow-md"
                  : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
                }`}
            >
              Inactivos
            </button>
          </div>

          {/* Buscador */}
          <div className="flex-1 flex justify-end align-middle">
            <SearchBar value={searchTerm} onChange={setSearchTerm} />
          </div>

          {/* Paginador simple */}
          <div className="flex items-center gap-4 text-sm text-slate-600">

            {/* Selector de cantidad */}
            <select
              className="border rounded-md px-2 py-1"
              value={50}
              onChange={() => { }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>

            <span>1 - 50 de {clients.length}</span>

            <button className="p-1 hover:bg-slate-200 rounded-md">
              ‹
            </button>
            <button className="p-1 hover:bg-slate-200 rounded-md">
              ›
            </button>
          </div>
        </div>


        {/* TABLA */}
        <section className="px-4 pb-6">
          <div className="rounded-3xl bg-white/70 backdrop-blur border border-white/80 overflow-hidden">
            <ClientsTable
              clients={sortedClients}
              loading={loading}
              error={error}
              sortKey={sortKey}
              sortDir={sortDir}
              onToggleSort={toggleSort}
              onOpenDetail={setDetailClient}
            />
          </div>
        </section>
      </div>

      {/* MODALS */}
      {showNewClient && (
        <Modal size="small" onClose={() => setShowNewClient(false)}>
          <NewClientModal
            onClose={() => setShowNewClient(false)}
            onCreated={fetchClients}
          />
        </Modal>
      )}

      {isNewPaymentOpen && (
        <Modal size="large" onClose={closeNewPayment}>
          <NewPaymentModal
            clients={clients}
            preselectedClientId={paymentClientId}
            onClose={closeNewPayment}
            onCreated={async () => {
              await fetchClients()
              closeNewPayment()
            }}
          />
        </Modal>
      )}

      {detailClient && (
        <Modal onClose={() => setDetailClient(null)}>
          <ClientDetailModal
            client={detailClient}
            onClose={() => setDetailClient(null)}
            onChanged={fetchClients}
            onRegisterPayment={(id) => {
              // cerrar el detalle y abrir modal de pago con el cliente preseleccionado
              setDetailClient(null)
              openNewPayment(id)
            }}
          />
        </Modal>
      )}
    </div>
  )
}
