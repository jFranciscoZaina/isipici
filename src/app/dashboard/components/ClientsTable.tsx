import type { ClientRow } from "../page";
import { formatDateEs } from "@/lib/utils";
import { Check, X } from "react-feather";
import { useState } from "react";
import { ClientContextMenu, type ClientMenuAction } from "./ClientContextMenu";

type Props = {
  clients: ClientRow[];
  loading: boolean;
  error: string | null;
  sortKey: "name" | "plan" | "paid" | "debt" | "due";
  sortDir: "asc" | "desc";
  onToggleSort: (key: "name" | "plan" | "paid" | "debt" | "due") => void;
  onOpenDetail: (client: ClientRow) => void;
  // Opcional: el padre puede engancharse a las acciones del menú
  onMenuAction?: (action: ClientMenuAction, client: ClientRow) => void;
};

export default function ClientsTable({
  clients,
  loading,
  error,
  sortKey,
  sortDir,
  onToggleSort,
  onOpenDetail,
  onMenuAction,
}: Props) {
  // Anchos iniciales de las columnas [Pago, Persona, Plan, Deuda, Vencimientos, Detalle]
  const [colWidths, setColWidths] = useState<number[]>([
    80, 260, 160, 140, 160, 120,
  ]);

  // Estado del menú contextual
  const [menuClient, setMenuClient] = useState<ClientRow | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const openMenu = (
    client: ClientRow,
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuClient(client);
    setMenuPosition({ top: rect.bottom + 8, left: rect.left });
  };

  const closeMenu = () => {
    setMenuClient(null);
    setMenuPosition(null);
  };

  const handleMenuAction = (action: ClientMenuAction, client: ClientRow) => {
    if (onMenuAction) {
      onMenuAction(action, client);
    } else {
      // Fallback: por ahora todo abre el modal de detalle
      onOpenDetail(client);
    }
  };

  // Resize columnas
  const startResize = (index: number, startX: number) => {
    const startWidth = colWidths[index];

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      setColWidths((prev) => {
        const next = [...prev];
        next[index] = Math.max(80, startWidth + delta); // mínimo 80px
        return next;
      });
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleResizeMouseDown =
    (index: number) => (e: React.MouseEvent<HTMLSpanElement>) => {
      e.preventDefault();
      e.stopPropagation();
      startResize(index, e.clientX);
    };

  return (
    <div className="h-full w-full rounded-br15 bg-bg0 border border-n2 overflow-hidden flex-1 flex flex-col">
      {/* Scroll SOLO dentro de la tabla */}
      <div className="h-full max-h-full overflow-y-auto scrollbar-hide">
        <table className="min-w-full table-auto">
          {/* HEADER */}
          <thead className="bg-[color:var(--n8)] fs-12 text-[color:var(--n0)]">
            <tr>
              {/* Pago */}
              <th
                style={{ width: colWidths[0], fontWeight: 400 }}
                className="relative cursor-pointer select-none pl-p40 pr-p20 py-p10 text-left"
                onClick={() => onToggleSort("paid")}
              >
                Pago{" "}
                <span className="fs-12 font-normal">
                  {sortKey === "paid" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </span>
                <span
                  onMouseDown={handleResizeMouseDown(0)}
                  className="absolute inset-y-0 right-0 w-[4px] cursor-col-resize"
                />
              </th>

              {/* Persona */}
              <th
                style={{ width: colWidths[1], fontWeight: 400 }}
                className="relative cursor-pointer select-none px-p20 py-p10 text-left"
                onClick={() => onToggleSort("name")}
              >
                Persona{" "}
                <span className="fs-12 font-normal">
                  {sortKey === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </span>
                <span
                  onMouseDown={handleResizeMouseDown(1)}
                  className="absolute inset-y-0 right-0 w-[4px] cursor-col-resize"
                />
              </th>

              {/* Plan */}
              <th
                style={{ width: colWidths[2], fontWeight: 400 }}
                className="relative cursor-pointer select-none px-p20 py-p10 text-left"
                onClick={() => onToggleSort("plan")}
              >
                Plan{" "}
                <span className="fs-12 font-normal">
                  {sortKey === "plan" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </span>
                <span
                  onMouseDown={handleResizeMouseDown(2)}
                  className="absolute inset-y-0 right-0 w-[4px] cursor-col-resize"
                />
              </th>

              {/* Deuda */}
              <th
                style={{ width: colWidths[3], fontWeight: 400 }}
                className="relative cursor-pointer select-none px-p20 py-p10 text-left"
                onClick={() => onToggleSort("debt")}
              >
                Deuda{" "}
                <span className="fs-12 font-normal">
                  {sortKey === "debt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </span>
                <span
                  onMouseDown={handleResizeMouseDown(3)}
                  className="absolute inset-y-0 right-0 w-[4px] cursor-col-resize"
                />
              </th>

              {/* Vencimientos */}
              <th
                style={{ width: colWidths[4], fontWeight: 400 }}
                className="relative cursor-pointer select-none px-p20 py-p10 text-left"
                onClick={() => onToggleSort("due")}
              >
                Vencimientos{" "}
                <span className="fs-12 font-normal">
                  {sortKey === "due" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </span>
                <span
                  onMouseDown={handleResizeMouseDown(4)}
                  className="absolute inset-y-0 right-0 w-[4px] cursor-col-resize"
                />
              </th>

              {/* Detalle */}
              <th
                style={{ width: colWidths[5], fontWeight: 400 }}
                className="relative px-p20 py-p10 text-left"
              >
                Detalle
                <span
                  onMouseDown={handleResizeMouseDown(5)}
                  className="absolute inset-y-0 right-0 w-[4px] cursor-col-resize"
                />
              </th>
            </tr>
          </thead>
          <div className="pb-p10" />
          {/* BODY */}
          <tbody className="bg-bg0 fs-12 text-app">
            {!loading &&
              !error &&
              clients.map((client) => (
                <tr
                  key={client.id}
                  className="border-b border-[color:var(--n0)] fs-12 text-app transition hover:border-[color:var(--n2)]"
                >
                  {/* Pago – más padding a la izquierda */}
                  <td className="pl-p50 pr-p20 py-p10">
                    {client.isMonthFullyPaid ? (
                      <Check className="h-4 w-4 stroke-[2.5] text-app" />
                    ) : (
                      <X className="h-4 w-4 stroke-[2.5] text-danger" />
                    )}
                  </td>

                  {/* Persona (NOMBRE EN NEGRITA) */}
                  <td className="px-p20 py-p10 fs-12 font-bold">
                    {client.name}
                  </td>

                  {/* Plan */}
                  <td className="px-p20 py-p10 fs-12 font-normal">
                    {client.currentPlan ?? (
                      <span className="text-app-disabled">Sin plan</span>
                    )}
                  </td>

                  {/* Deuda */}
                  <td className="px-p20 py-p10 fs-12 font-normal">
                    {client.currentDebt > 0
                      ? "$" +
                        client.currentDebt.toLocaleString("es-AR", {
                          maximumFractionDigits: 0,
                        })
                      : "—"}
                  </td>

                  {/* Vencimientos */}
                  <td className="px-p20 py-p10 fs-12 font-normal">
                    {formatDateEs(client.nextDue)}
                  </td>

                  {/* Detalle → abre menú contextual */}
                  <td className="px-p20 py-p10 fs-12">
                    <button
                      className="fs-12 text-[color:var(--color-accent-primary)] no-underline hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        openMenu(client, e);
                      }}
                    >
                      Ver más
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* MENÚ CONTEXTUAL */}
      <ClientContextMenu
        client={menuClient}
        position={menuPosition}
        onClose={closeMenu}
        onAction={handleMenuAction}
      />
    </div>
  );
}
