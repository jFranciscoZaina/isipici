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
import InlineLoader from "./components/InlineLoader";
import {useSubmissionLock} from "./components/useSubmissionLock";
import {useConfirm} from "./components/ConfirmProvider";
import {useToast} from "./components/ToastProvider";
import {LOADER_DELAY} from "@/lib/ui/toast-state";
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

const emptyClients:ClientRow[]=[];

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



// === ROOT DASHBOARD ===============================================================

export default function DashboardPage() {
  const submission=useSubmissionLock();
  const toast=useToast(),confirm=useConfirm();
  const [snapshots,setSnapshots]=useState<Partial<Record<ClientStatus,{clients:ClientRow[];currency:Currency}>>>({});
  const [settledStatus,setSettledStatus]=useState<ClientStatus|null>(null);
  const [deleting,setDeleting]=useState(false);

  const [loading, setLoading] = useState(true);
  const [requestError,setRequestError]=useState<{status:ClientStatus;message:string}|null>(null);

  const [showNewClient, setShowNewClient] = useState(false);

  // Modal de pago
  const [isNewPaymentOpen, setIsNewPaymentOpen] = useState(false);
  const [paymentClientId, setPaymentClientId] = useState<string | undefined>();

  // Modal de detalle
  const [detailClient, setDetailClient] = useState<ClientRow | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<TabId>("data");


  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [sortKey, setSortKey] = useState<
    "name" | "plan" | "paid" | "debt" | "due"
  >("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [status, setStatus] = useState<ClientStatus>("active");
  const snapshot=snapshots[status],loaded=Boolean(snapshot),clients=snapshot?.clients??emptyClients,ownerCurrency=snapshot?.currency??"ARS";
  const error=requestError?.status===status?requestError.message:null;
  const waiting=loading||settledStatus!==status;

  // Helpers para el modal de pago
  const openNewPayment = (clientId?: string) => {
    if(!loaded)return;
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
    const operation=toast.start("Actualizando clientes...",LOADER_DELAY);
    controller.signal.addEventListener("abort",()=>operation.close(),{once:true});
    try {
      setLoading(true);
      const res = await fetch(`/api/clients?status=${status}`, { signal: controller.signal });

      if (res.status === 401) {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
          operation.close();
        }
        return;
      }

      if (!res.ok) throw new Error("Error cargando clientes");

      const currency = res.headers.get("X-Owner-Currency");
      if (currency !== "ARS" && currency !== "AUD") throw new Error("Configuración de moneda no disponible");

      const data: ClientRow[] = await res.json();
      if (controller.signal.aborted) return;
      setSnapshots(old=>({...old,[status]:{clients:data,currency}}));operation.close();
      setRequestError(null);
    } catch (e: unknown) {
      if (controller.signal.aborted) return;
      console.error(e);
      setRequestError({status,message:"No se pudieron cargar los clientes."});operation.error("No se pudieron cargar los clientes.");
    } finally {
      operation.close();if (!controller.signal.aborted){setSettledStatus(status);setLoading(false);}
    }
  }, [status,toast]);

  useEffect(() => {
    void fetchClients();
    return () => clientsRequest.current?.abort();
  }, [fetchClients]);

  const refreshAfterMutation=useCallback(()=>{setSnapshots(old=>old[status]?{[status]:old[status]}:{});return fetchClients()},[status,fetchClients]);

  const handleClientsImported=()=>{
    setSearchTerm("");
    setCurrentPage(1);
    if(status==="inactive"){void refreshAfterMutation();return;}
    setSnapshots({});
    setStatus("inactive");
  };

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
    if(deleting)return;
    const accepted=await confirm({title:"Dar de baja cliente",message:"Se pausarán futuros cobros y vencimientos. Los pagos y deudas existentes se conservarán.",confirmLabel:"Dar de baja"});
    if(!accepted||!submission.acquire())return;
    setDeleting(true);const operation=toast.start("Dando de baja cliente...");
    try{const res=await fetch(`/api/clients/${client.id}`,{method:"DELETE"});if(res.status===401){window.location.href="/login";operation.close();return;}if(!res.ok)throw new Error("No se pudo dar de baja al cliente.");operation.success("Cliente dado de baja.");await refreshAfterMutation();setDetailClient(null)}catch{operation.error("No se pudo dar de baja al cliente.")}finally{submission.release();operation.close();setDeleting(false)}
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
    <div className="h-screen w-screen bg-bg1 flex items-stretch justify-center px-[var(--p0)] py-[var(--p10)] md:p-[var(--p10)]">
      <div className="w-full h-full bg-bg0 rounded-br25 shadow-lg flex flex-col gap-p20 overflow-hidden grain-surface p-p20 px-p30">
        {/* HEADER */}
        <TopBar
          onClientsImported={handleClientsImported}
          paymentReady={loaded}
          onNewPayment={() => openNewPayment()}
          onNewClient={() => setShowNewClient(true)}
        />

        {/* STATS */}
        <section className="flex-shrink-0">
          <StatsGrid {...stats} available={loaded} />
        </section>

        {/* Tabs + buscador + paginador */}
        <div className="flex flex-col gap-p20 h-full min-h-0 flex-1">
          <SearchTabsAndPagination
            searchTerm={searchTerm}
            onSearchChange={(value) => { setSearchTerm(value); setCurrentPage(1); }}
            status={status}
            onStatusChange={(value) => { setStatus(value); setCurrentPage(1); }}
            available={loaded}
            totalClients={sortedClients.length}
            currentPage={visiblePage}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setItemsPerPage(size); setCurrentPage(1); }}
          />

          {error&&<button className="btn-secondary" disabled={loading} onClick={()=>void fetchClients()}>Reintentar carga de clientes</button>}
          {waiting&&loaded&&<InlineLoader text="Actualizando clientes..."/>}
          {/* TABLA */}
          <section className="flex flex-col flex-1 min-h-0">
            <ClientsTable
              clients={pageClients}
              loading={waiting&&(!loaded||clients.length===0)}
              error={loaded?null:error}
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
            onCreated={refreshAfterMutation}
          />
        )}

        {isNewPaymentOpen && (
          <NewPaymentModal
            clients={clients}
            preselectedClientId={paymentClientId}
            onClose={closeNewPayment}
            onCreated={async () => {
              await refreshAfterMutation();
              closeNewPayment();
            }}
          />
        )}

        {detailClient && (
          <ClientDetailModal
            key={detailClient.id}
            client={detailClient}
            onClose={() => setDetailClient(null)}
            onChanged={refreshAfterMutation}
            initialTab={detailInitialTab}
          />
        )}


      </div>
    </div>
  );
}
