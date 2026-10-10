"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TopBar from "./components/TopBar";
import SearchTabsAndPagination, {
  ClientStatus,
} from "./components/SearchBarAndTabs";
import StatsGrid from "./components/StatsGrid";
import ClientsTable from "./components/ClientsTable";
import dynamic from "next/dynamic";

import type { TabId } from "./components/ClientDetailModal";

const NewClientModal = dynamic(() => import("./components/NewClientModal"));
const NewPaymentModal = dynamic(() => import("./components/NewPaymentModal"));
const ClientDetailModal = dynamic(() => import("./components/ClientDetailModal"));
import type { ClientMenuAction } from "./components/ClientContextMenu";
import ConfirmDialog from "./components/ConfirmDialog";
import Snackbar from "./components/Snackbar";
import type { Currency, PaymentProvider, PaymentType } from "@/lib/payments/types";

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
  currency: Currency;
  hasPayments: boolean;
  archivedAt?: string | null;
};

export type Payment = {
  payment_allocations?: {amount_applied:number;discount_applied:number;installment:{period_from:string;period_to:string}|null}[];
  id: string;
  amount: number;
  plan: string | null;
  discount: number | null;
  debt: number | null;
  next_payment_date: string | null;
  period_from: string | null;
  period_to: string | null;
  created_at: string;
  currency?: Currency;
  provider?: PaymentProvider;
  payment_type?: PaymentType | null;
  concept?: string | null;
  service_date?: string | null;
  receipt_note?: string | null;
};

export const PLANS = ["Starter", "Plus", "Premium","Pro","total", "Pago deuda"] as const;
export type PlanType = (typeof PLANS)[number];

// === ROOT DASHBOARD ===============================================================

export default function DashboardPage() {
  const [ownerCurrency, setOwnerCurrency] = useState<Currency>("ARS");
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
  const [confirmDeleteClient, setConfirmDeleteClient] = useState<ClientRow | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
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
  const clientsRequest = useRef<AbortController | null>(null);
  const fetchClients = useCallback(async () => {
    clientsRequest.current?.abort();
    const controller = new AbortController();
    clientsRequest.current = controller;
    try {
      setLoading(true);
      const res = await fetch(`/api/clients?status=${status}`, { signal: controller.signal });

      if (res.status === 401) {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return;
      }

      if (!res.ok) throw new Error("Error cargando clientes");

      const currency = res.headers.get("X-Owner-Currency");
      if (currency !== "ARS" && currency !== "AUD") throw new Error("Configuración de moneda no disponible");
      setOwnerCurrency(currency);
      const data: ClientRow[] = await res.json();
      if (controller.signal.aborted) return;
      setClients(data);
      setError(null);
    } catch (e: unknown) {
      if (controller.signal.aborted) return;
      console.error(e);
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void fetchClients();
    return () => clientsRequest.current?.abort();
  }, [fetchClients]);

  // === Stats =====================================================================
  const stats = useMemo(
    () => ({
      totalClients: clients.length,
      clientsWithDebt: clients.filter((c) => (c.currentDebt ?? 0) > 0).length,
      currency: ownerCurrency,
      monthlyIncome: clients.reduce((sum, c) => sum + (c.totalPaidThisMonth || 0), 0),
    }),
    [clients, ownerCurrency]
  );

  // === Ordenamiento =============================================================
  const toggleSort = (key: typeof sortKey) => {
    setCurrentPage(1);
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // === Acciones del menú contextual ============================================

  async function handleDeleteClient(client: ClientRow) {
    setConfirmDeleteClient(client);
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

  const visiblePage = Math.min(currentPage, Math.max(1, Math.ceil(sortedClients.length / itemsPerPage)));
  const pageClients = sortedClients.slice((visiblePage - 1) * itemsPerPage, visiblePage * itemsPerPage);

  // === RENDER ===================================================================
  return (
    <div className="h-screen w-screen bg-bg1 flex items-stretch justify-center px-[var(--p0)] py-[var(--p20)] md:p-[var(--p20)]">
      <div className="w-full h-full bg-bg0 rounded-br25 shadow-lg flex flex-col gap-p20 overflow-hidden grain-surface p-p20 pt-p10">
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
            onSearchChange={(value) => { setSearchTerm(value); setCurrentPage(1); }}
            status={status}
            onStatusChange={(value) => { setStatus(value); setCurrentPage(1); }}
            totalClients={sortedClients.length}
            currentPage={visiblePage}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setItemsPerPage(size); setCurrentPage(1); }}
          />

          {/* TABLA */}
          <section className="flex flex-col flex-1 min-h-0">
            <ClientsTable
              clients={pageClients}
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
            onSuccess={(msg) => setSnackbar({ message: msg, type: "success" })}
            onError={(msg) => setSnackbar({ message: msg, type: "error" })}
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
            onSuccess={(msg) => setSnackbar({ message: msg, type: "success" })}
            onError={(msg) => setSnackbar({ message: msg, type: "error" })}
          />
        )}

        {detailClient && (
          <ClientDetailModal
            key={detailClient.id}
            client={detailClient}
            onClose={() => setDetailClient(null)}
            onChanged={fetchClients}
            initialTab={detailInitialTab}
          />
        )}

        <ConfirmDialog
          open={!!confirmDeleteClient}
          title="Dar de baja cliente"
          message="Se pausarán futuros cobros y vencimientos. Los pagos y deudas existentes se conservarán. ¿Continuar?"
          confirmLabel="Dar de baja"
          onCancel={() => setConfirmDeleteClient(null)}
          onConfirm={async () => {
            if (!confirmDeleteClient) return;
            try {
              const res = await fetch(`/api/clients/${confirmDeleteClient.id}`, {
                method: "DELETE",
              });
              if (res.status === 401) { window.location.href = "/login"; return; }
              if (!res.ok) throw new Error("Error dando de baja al cliente");
              await fetchClients();
              setDetailClient(null);
            } catch (err) {
              console.error(err);
              alert(
                err instanceof Error ? err.message : "Error eliminando cliente"
              );
            } finally {
              setConfirmDeleteClient(null);
            }
          }}
        />

        {snackbar && (
          <Snackbar
            message={snackbar.message}
            type={snackbar.type}
            onClose={() => setSnackbar(null)}
          />
        )}
      </div>
    </div>
  );
}
