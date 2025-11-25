"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import TopBar from "./components/TopBar"
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
  const [sortKey, setSortKey] = useState<"name" | "plan" | "paid" | "debt" | "due">("name")
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
          return (a.currentPlan ?? "").localeCompare(b.currentPlan ?? "") * dir
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
    <div className="min-h-screen bg-slate-50">
      <TopBar
        onNewPayment={() => openNewPayment()}
        onNewClient={() => setShowNewClient(true)}
      />

      <main className="px-8 py-6">
        <SearchBar value={searchTerm} onChange={setSearchTerm} />
        <StatsGrid {...stats} />

        {/* TABS Active / Inactive */}
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => setStatus("active")}
            className={`rounded-md px-4 py-2 text-sm font-medium border transition
              ${
                status === "active"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
          >
            Activos
          </button>

          <button
            onClick={() => setStatus("inactive")}
            className={`rounded-md px-4 py-2 text-sm font-medium border transition
              ${
                status === "inactive"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
          >
            Inactivos
          </button>
        </div>

        <ClientsTable
          clients={sortedClients}
          loading={loading}
          error={error}
          sortKey={sortKey}
          sortDir={sortDir}
          onToggleSort={toggleSort}
          onOpenDetail={setDetailClient}
        />
      </main>

      {/* MODAL NUEVO CLIENTE */}
      {showNewClient && (
        <Modal onClose={() => setShowNewClient(false)}>
          <NewClientModal
            onClose={() => setShowNewClient(false)}
            onCreated={fetchClients}
          />
        </Modal>
      )}

      {/* MODAL NUEVO PAGO */}
      {isNewPaymentOpen && (
        <Modal onClose={closeNewPayment}>
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

      {/* MODAL DETALLE DE CLIENTE */}
      {detailClient && (
        <Modal onClose={() => setDetailClient(null)}>
          <ClientDetailModal
            client={detailClient}
            onClose={() => setDetailClient(null)}
            onChanged={fetchClients}
            onRegisterPayment={(clientId) => {
              // cierro detalle y abro modal de pago para ese cliente
              setDetailClient(null)
              openNewPayment(clientId)
            }}
          />
        </Modal>
      )}
    </div>
  )
}
