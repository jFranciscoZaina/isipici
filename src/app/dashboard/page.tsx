"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DollarSign, Plus, UserPlus, X } from "react-feather";
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
import {useI18n} from "../I18nProvider";

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
  const {t}=useI18n();
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
    const operation=toast.start(t("dashboard.refresh"),LOADER_DELAY);
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

      if (!res.ok) throw new Error(t("dashboard.loadError"));

      const currency = res.headers.get("X-Owner-Currency");
      if (currency !== "ARS" && currency !== "AUD") throw new Error(t("dashboard.currencyError"));

      const data: ClientRow[] = await res.json();
      if (controller.signal.aborted) return;
      setSnapshots(old=>({...old,[status]:{clients:data,currency}}));operation.close();
      setRequestError(null);
    } catch (e: unknown) {
      if (controller.signal.aborted) return;
      console.error(e);
      setRequestError({status,message:t("dashboard.loadError")});operation.error(t("dashboard.loadError"));
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
    const accepted=await confirm({title:t("dashboard.archiveTitle"),message:t("dashboard.archiveMessage"),confirmLabel:t("dashboard.archiveConfirm")});
    if(!accepted||!submission.acquire())return;
    setDeleting(true);const operation=toast.start(t("dashboard.archiving"));
    try{const res=await fetch(`/api/clients/${client.id}`,{method:"DELETE"});if(res.status===401){window.location.href="/login";operation.close();return;}if(!res.ok)throw new Error(t("dashboard.loadError"));operation.success(t("dashboard.archived"));await refreshAfterMutation();setDetailClient(null)}catch{operation.error(t("dashboard.loadError"))}finally{submission.release();operation.close();setDeleting(false)}
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
    <div className="h-dvh w-screen bg-bg0 flex items-stretch justify-center p-p0 md:h-screen md:bg-bg1 md:px-[var(--p0)] md:py-[var(--p10)]">
      <div className="w-full h-full bg-bg0 rounded-none shadow-none flex flex-col gap-p10 overflow-hidden grain-surface p-p10 md:rounded-br25 md:shadow-lg md:gap-p20 md:p-p20 md:px-p30">
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
        <div className="flex flex-col gap-p10 md:gap-p20 h-full min-h-0 flex-1">
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

          {error&&<button className="btn-secondary" disabled={loading} onClick={()=>void fetchClients()}>{t("dashboard.retry")}</button>}
          {waiting&&loaded&&<InlineLoader text={t("dashboard.refresh")}/>}
          {/* TABLA */}
          <section className="flex flex-col flex-1 min-h-0">
            <ClientsTable
              clients={pageClients}
              status={status}
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

        <MobileDashboardActions onNewPayment={() => openNewPayment()} onNewClient={() => setShowNewClient(true)} paymentReady={loaded} />

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

function MobileDashboardActions({onNewPayment,onNewClient,paymentReady}:{onNewPayment:()=>void;onNewClient:()=>void;paymentReady:boolean}) {
  const {t}=useI18n();
  const [open,setOpen]=useState(false);

  useEffect(()=>{
    if(!open)return;
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};
    document.addEventListener("keydown",onKeyDown);
    return()=>document.removeEventListener("keydown",onKeyDown);
  },[open]);

  return <div className="md:hidden">
    <button type="button" onClick={()=>setOpen(true)} aria-label={t("topbar.openMenu")} className="fixed bottom-[calc(var(--p20)+env(safe-area-inset-bottom))] left-[var(--p30)] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--color-accent-primary)] text-[color:var(--color-text-on-primary)] shadow-lg transition-transform active:scale-95">
      <Plus className="h-7 w-7" strokeWidth={2.5}/>
    </button>
    {open&&<div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={()=>setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label={t("topbar.openMenu")} className="w-full rounded-t-[var(--br25)] bg-bg0 px-p30 pt-p30 pb-[calc(var(--p30)+env(safe-area-inset-bottom))] shadow-lg" onClick={event=>event.stopPropagation()}>
        <div className="mb-p20 flex items-center justify-between"><h2 className="fs-16 font-semibold text-app">{t("topbar.openMenu")}</h2><button type="button" onClick={()=>setOpen(false)} aria-label={t("common.close")} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-bg1"><X className="h-5 w-5"/></button></div>
        <div className="flex flex-col gap-p10">
          <button type="button" disabled={!paymentReady} onClick={()=>{setOpen(false);onNewPayment()}} className="btn-primary min-h-12 w-full justify-center disabled:opacity-50"><DollarSign className="h-4 w-4"/><span>{t("topbar.payment")}</span></button>
          <button type="button" onClick={()=>{setOpen(false);onNewClient()}} className="btn-primary min-h-12 w-full justify-center"><UserPlus className="h-4 w-4"/><span>{t("topbar.client")}</span></button>
        </div>
      </section>
    </div>}
  </div>
}
