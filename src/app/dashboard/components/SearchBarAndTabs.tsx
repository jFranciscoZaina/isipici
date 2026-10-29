"use client";

import React from "react";
import { Search as SearchIcon } from "react-feather";
import {useI18n} from "../../I18nProvider";

export type ClientStatus = "active" | "inactive" | "archived";

export type SearchTabsAndPaginationProps = {
  available?: boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  status: ClientStatus;
  onStatusChange: (status: ClientStatus) => void;
  totalClients: number;
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export default function SearchTabsAndPagination({
  available=true,searchTerm,onSearchChange,status,onStatusChange,totalClients,currentPage,itemsPerPage,onPageChange,onPageSizeChange,
}: SearchTabsAndPaginationProps) {
  const {t}=useI18n();
  const totalPages = Math.max(1, Math.ceil(totalClients / itemsPerPage));
  const startCount = totalClients === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endCount = Math.min(currentPage * itemsPerPage, totalClients);

  return (
    <div className="flex flex-shrink-0 flex-col gap-[var(--p10)] md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
      <div className="flex items-center justify-between gap-p5">
        {([
          ["active",t("search.active")],
          ["inactive",t("search.inactive")],
          ["archived",t("search.archived")],
        ] as [ClientStatus,string][]).map(([value,label])=>(
          <button
            key={value}
            onClick={()=>onStatusChange(value)}
            className={`min-h-11 flex-1 rounded-[var(--br10)] px-[var(--p10)] fs-14 transition md:min-h-0 md:flex-none md:rounded-none md:px-5 ${status===value?"text-app font-bold":"text-app-secondary hover:bg-bg3 font-medium"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="fixed bottom-[calc(var(--p20)+env(safe-area-inset-bottom))] left-[calc(var(--p30)+3.5rem+var(--p10))] right-[var(--p30)] z-30 flex justify-end md:static md:z-auto md:flex-1">
        <div className="relative group w-full max-w-md">
          <span className="pointer-events-none absolute left-0 top-1/2 hidden h-6 w-px -translate-y-1/2 border border-n8 transition-all duration-300 ease-out group-focus-within:opacity-0 group-focus-within:scale-y-50 md:block"/>
          <span className="pointer-events-none absolute bottom-0 left-0 right-0 hidden h-px origin-center scale-x-0 opacity-0 transition-all duration-300 ease-out group-focus-within:scale-x-100 group-focus-within:opacity-100 md:block" style={{backgroundColor:"var(--n8)"}}/>
          <div className="flex h-14 items-center gap-p10 rounded-full border border-n2 bg-bg0 px-p20 text-sm text-app-secondary shadow-lg md:h-auto md:min-h-0 md:gap-2 md:rounded-none md:border-0 md:bg-transparent md:pl-6 md:pr-3 md:py-2 md:shadow-none">
            <SearchIcon className="w-4 h-4 text-app-secondary" strokeWidth={2}/>
            <input
              className="w-full rounded-full border-none bg-transparent outline-none placeholder:text-app-secondary text-app md:rounded-none"
              placeholder={t("search.placeholder")}
              value={searchTerm}
              onChange={(e)=>onSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-[var(--p5)] text-app-secondary fs-12 font-semibold md:justify-end md:gap-4">
        <label className="flex min-h-10 items-center gap-p5 rounded-br10 border border-n2 px-p10 md:min-h-0 md:rounded-none md:border-0 md:px-0"><span className="sr-only">{t("search.of")}</span><select className="border-none bg-bg0 text-app fs-12 font-semibold" value={itemsPerPage} onChange={(event)=>onPageSizeChange(Number(event.target.value))}>
          <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
        </select></label>
        <span className="fs-12 font-semibold text-app">{available?startCount:"—"}-{available?endCount:"—"} {t("search.of")} {available?totalClients:"—"}</span>
        <div className="flex items-center"><button className="flex h-10 w-10 items-center justify-center rounded-br10 hover:bg-bg3 fs-12 font-semibold md:h-auto md:w-auto md:p-2" aria-label={t("search.previous")} onClick={()=>onPageChange(currentPage-1)} disabled={currentPage<=1}>‹</button>
        <button className="flex h-10 w-10 items-center justify-center rounded-br10 hover:bg-bg3 fs-12 font-semibold md:h-auto md:w-auto md:p-2" aria-label={t("search.next")} onClick={()=>onPageChange(currentPage+1)} disabled={currentPage>=totalPages}>›</button></div>
      </div>
    </div>
  );
}
