"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import TopBar from "./components/TopBar";
import SearchTabsAndPagination, {
  ClientStatus,
} from "./components/SearchBarAndTabs";
import StatsGrid from "./components/StatsGrid";
import ClientsTable from "./components/ClientsTable";
import NewClientModal from "./components/NewClientModal";
import NewPaymentModal from "./components/NewPaymentModal";
import ClientDetailModal, { type TabId } from "./components/ClientDetailModal";
import type { ClientMenuAction } from "./components/ClientContextMenu";

// === TYPES =======================================================================

export type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  addressNumber: string | null;
  currentPlan: string | null;
  currentDebt: number;
  totalPaidThisMonth: number;
  nextDue: string | null;
  isMonthFullyPaid: boolean;
};

export type Payment = {
  id: string;
  amount: number;
  plan: string | null;
  discount: number | null;
  debt: number | null;
  next_payment_date: string | null;
  period_from: string | null;
  period_to: string | null;
  created_at: string;
};

export const PLANS = ["Basic", "Fitness", "Pro fitness", "Pago deuda"] as const;
export type PlanType = (typeof PLANS)[number];

// === ROOT DASHBOARD ===============================================================

export default function DashboardPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showNewClient, setShowNewClient] = useState(false);

  // Modal de pago
  const [isNewPaymentOpen, setIsNewPaymentOpen] = useState(false);
  const [paymentClientId, setPaymentClientId] = useState<string | undefined>();

  // Modal de detalle
  const [detailClient, setDetailClient] = useState<ClientRow | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<TabId>("data");

  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<
    "name" | "plan" | "paid" | "debt" | "due"
  >("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [status, setStatus] = useState<ClientStatus>("active");

  // Helpers para el modal de pago
  const openNewPayment = (clientId?: string) => {
    setPaymentClientId(clientId);
    setIsNewPaymentOpen(true);
  };

  const closeNewPayment = () => {
    setIsNewPaymentOpen(false);
    setPaymentClientId(undefined);
  };

  // === Fetch de clientes =========================================================
  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/clients?status=${status}`);

      if (res.status === 401) {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return;
      }

      if (!res.ok) throw new Error("Error cargando clientes");

      const data: ClientRow[] = await res.json();
      setClients(data);
      setError(null);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // === Stats =====================================================================
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
  );

  // === Ordenamiento =============================================================
  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // === Acciones del menú contextual ============================================

  async function handleDeleteClient(client: ClientRow) {
    if (!confirm("¿Eliminar este cliente y todo su historial de pagos?"))
      return;

    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Error eliminando cliente");

      await fetchClients(); // refresca la tabla
      setDetailClient(null);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Error eliminando cliente");
    }
  }

  function handleClientMenuAction(action: ClientMenuAction, client: ClientRow) {
    switch (action) {
      case "editProfile":
        setDetailClient(client);
        setDetailInitialTab("data");
        break;

      case "paymentsHistory":
        setDetailClient(client);
        setDetailInitialTab("payments");
        break;

      case "emailsHistory":
        setDetailClient(client);
        setDetailInitialTab("emails");
        break;

      case "registerPayment":
        openNewPayment(client.id);
        break;

      case "delete":
        void handleDeleteClient(client);
        break;

      default:
        break;
    }
  }

  // === Lista filtrada y ordenada ===============================================
  const sortedClients = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    const filtered = clients.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q)
    );

    const dir = sortDir === "asc" ? 1 : -1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return [...filtered].sort((a, b) => {
      const aDue = a.nextDue ? new Date(a.nextDue) : null;
      const bDue = b.nextDue ? new Date(b.nextDue) : null;
      if (aDue) aDue.setHours(0, 0, 0, 0);
      if (bDue) bDue.setHours(0, 0, 0, 0);
      const aOverdue = !!aDue && aDue < today;
      const bOverdue = !!bDue && bDue < today;

      const paidValue = (c: typeof a, overdue: boolean) => {
        if (overdue) return 0; // minus
        if (c.isMonthFullyPaid) return 2; // check
        return 1; // cross / pendiente
      };

      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "plan":
          return (a.currentPlan ?? "").localeCompare(b.currentPlan ?? "") * dir;
        case "paid":
          return (paidValue(a, aOverdue) - paidValue(b, bOverdue)) * dir;
        case "debt":
          return (a.currentDebt - b.currentDebt) * dir;
        case "due": {
          const aTime = aDue ? aDue.getTime() : Infinity;
          const bTime = bDue ? bDue.getTime() : Infinity;
          return (aTime - bTime) * dir;
        }
        default:
          return 0;
      }
    });
  }, [clients, searchTerm, sortKey, sortDir]);

  // === RENDER ===================================================================
  return (
    <div className="h-screen w-screen bg-bg1 flex items-stretch justify-center p-p20">
      <div className="w-full h-full bg-bg0 rounded-br25 shadow-lg pt-p10 p-p30 flex flex-col gap-p20 overflow-hidden grain-surface">
        {/* HEADER */}
        <TopBar
          onNewPayment={() => openNewPayment()}
          onNewClient={() => setShowNewClient(true)}
        />

        {/* STATS */}
        <section className="flex-shrink-0">
          <StatsGrid {...stats} />
        </section>

        {/* Tabs + buscador + paginador */}
        <div className="flex flex-col gap-p20 h-full min-h-0 flex-1">
          <SearchTabsAndPagination
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            status={status}
            onStatusChange={setStatus}
            totalClients={clients.length}
          />

          {/* TABLA */}
          <section className="flex flex-col flex-1 min-h-0">
            <ClientsTable
              clients={sortedClients}
              loading={loading}
              error={error}
              sortKey={sortKey}
              sortDir={sortDir}
              onToggleSort={toggleSort}
              onOpenDetail={setDetailClient} // fallback: click en "Ver más"
              onMenuAction={handleClientMenuAction}
            />
          </section>
        </div>

        {/* MODALS */}
        {showNewClient && (
          <NewClientModal
            onClose={() => setShowNewClient(false)}
            onCreated={fetchClients}
          />
        )}

        {isNewPaymentOpen && (
          <NewPaymentModal
            clients={clients}
            preselectedClientId={paymentClientId}
            onClose={closeNewPayment}
            onCreated={async () => {
              await fetchClients();
              closeNewPayment();
            }}
          />
        )}

        {detailClient && (
          <ClientDetailModal
            client={detailClient}
            onClose={() => setDetailClient(null)}
            onChanged={fetchClients}
            initialTab={detailInitialTab}
          />
        )}
      </div>
    </div>
  );
}
