"use client";

import React from "react";
import { Search as SearchIcon } from "react-feather";

export type ClientStatus = "active" | "inactive";

export type SearchTabsAndPaginationProps = {
  searchTerm: string;
  onSearchChange: (value: string) => void;

  status: ClientStatus;
  onStatusChange: (status: ClientStatus) => void;

  totalClients: number;
};

export default function SearchTabsAndPagination({
  searchTerm,
  onSearchChange,
  status,
  onStatusChange,
  totalClients,
}: SearchTabsAndPaginationProps) {
  const itemsPerPage = 50;
  const currentPage = 1;
  const totalPages = Math.ceil(totalClients / itemsPerPage);
  const startCount = (currentPage - 1) * itemsPerPage + 1;
  const endCount = Math.min(currentPage * itemsPerPage, totalClients);

  return (
    <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-4">
      {/* ================= TABS ================= */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onStatusChange("active")}
          className={`px-5  fs-14 transition ${
            status === "active"
              ? "text-app font-bold"
              : "text-app-secondary hover:bg-bg3 font-medium"
          }`}
        >
          Activos
        </button>

        <button
          onClick={() => onStatusChange("inactive")}
          className={`px-5  fs-14 transition ${
            status === "inactive"
              ? "text-app  font-bold"
              : "text-app-secondary hover:bg-bg3 font-medium"
          }`}
        >
          Inactivos
        </button>
      </div>

      {/* ================= BUSCADOR ================= */}
      <div className="flex-1 flex justify-end">
        <div className="relative group w-full max-w-md">
          {/* barra vertical (idle) */}
          <span
            className="
    pointer-events-none
    absolute left-0 top-1/2 -translate-y-1/2
    h-6 w-px
    border border-n8
    transition-all duration-300 ease-out
    group-focus-within:opacity-0 group-focus-within:scale-y-50
  "
          />

          {/* barra inferior (focus) */}
          <span
            className="
    pointer-events-none
    absolute left-0 right-0 bottom-0
    h-px
    origin-center
    scale-x-0
    opacity-0
    transition-all duration-300 ease-out
    group-focus-within:scale-x-100 group-focus-within:opacity-100
  "
            style={{ backgroundColor: "var(--n8)" }}
          />

          <div className="flex items-center gap-2 pl-6 pr-3 py-2 text-sm text-app-secondary border-none rounded-none">
            <SearchIcon
              className="w-4 h-4 text-app-secondary"
              strokeWidth={2}
            />
            <input
              className="
                w-full bg-transparent outline-none border-none rounded-none
                placeholder:text-app-secondary text-app
              "
              placeholder="Buscar por nombre, email o teléfono..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ================= PAGINADOR ================= */}
      <div className="flex items-center gap-4 text-app-secondary fs-12 font-semibold">
        <select
          className="border-none rounded-none bg-bg0 text-app fs-12 font-semibold"
          value={itemsPerPage}
          onChange={() => {}}
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>

        <span className="fs-12 font-semibold text-app">
          {startCount} - {endCount} de {totalClients}
        </span>

        <button
          className="p-2 rounded-md hover:bg-bg3 fs-12 font-semibold"
          disabled={currentPage === 1}
        >
          ‹
        </button>
        <button
          className="p-2 rounded-md hover:bg-bg3 fs-12 font-semibold"
          disabled={currentPage === totalPages}
        >
          ›
        </button>
      </div>
    </div>
  );
}
