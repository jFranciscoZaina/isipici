import type { ClientRow } from "../page"

export default function ClientsTable({
  clients,
  loading,
  error,
  sortKey,
  sortDir,
  onToggleSort,
  onOpenDetail,
}: {
  clients: ClientRow[]
  loading: boolean
  error: string | null
  sortKey: "name" | "plan" | "paid" | "debt" | "due"
  sortDir: "asc" | "desc"
  onToggleSort: (key: "name" | "plan" | "paid" | "debt" | "due") => void
  onOpenDetail: (client: ClientRow) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <table className="min-w-full">
        <thead className="bg-slate-100 text-xs uppercase text-slate-500">
          <tr>
            <th
              className="py-2 px-4 text-left cursor-pointer select-none"
              onClick={() => onToggleSort("name")}
            >
              Persona {sortKey === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
            </th>

            <th
              className="py-2 px-4 text-left cursor-pointer select-none"
              onClick={() => onToggleSort("plan")}
            >
              Plan {sortKey === "plan" ? (sortDir === "asc" ? "▲" : "▼") : ""}
            </th>

            <th
              className="py-2 px-4 text-center cursor-pointer select-none"
              onClick={() => onToggleSort("paid")}
            >
              Pago {sortKey === "paid" ? (sortDir === "asc" ? "▲" : "▼") : ""}
            </th>

            <th
              className="py-2 px-4 text-left cursor-pointer select-none"
              onClick={() => onToggleSort("debt")}
            >
              Deuda {sortKey === "debt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
            </th>

            <th
              className="py-2 px-4 text-left cursor-pointer select-none"
              onClick={() => onToggleSort("due")}
            >
              Vencimientos {sortKey === "due" ? (sortDir === "asc" ? "▲" : "▼") : ""}
            </th>

            <th className="py-2 px-4 text-left">Detalle</th>
          </tr>
        </thead>

        <tbody>
          {loading && (
            <tr>
              <td colSpan={6} className="py-6 px-4 text-center text-sm text-slate-500">
                Cargando clientes...
              </td>
            </tr>
          )}

          {!loading && error && (
            <tr>
              <td colSpan={6} className="py-6 px-4 text-center text-sm text-red-500">
                {error}
              </td>
            </tr>
          )}

          {!loading && !error && clients.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 px-4 text-center text-sm text-slate-500">
                No hay clientes aún
              </td>
            </tr>
          )}

          {!loading &&
            !error &&
            clients.map((client) => (
              <tr key={client.id} className="border-t text-sm text-slate-700">
                <td className="py-3 px-4">{client.name}</td>

                <td className="py-3 px-4">
                  {client.currentPlan ?? <span className="text-slate-400">Sin plan</span>}
                </td>

                <td className="py-3 px-4 text-center">
                  {client.isMonthFullyPaid ? "✔️" : "❌"}
                </td>

                <td className="py-3 px-4">
                  {client.currentDebt > 0
                    ? "$" +
                      client.currentDebt.toLocaleString("es-AR", {
                        maximumFractionDigits: 0,
                      })
                    : "—"}
                </td>

                <td className="py-3 px-4">
                  {client.nextDue
                    ? new Date(client.nextDue).toLocaleDateString("es-AR")
                    : "—"}
                </td>

                <td className="py-3 px-4">
                  <button
                    className="text-blue-600 hover:underline"
                    onClick={() => onOpenDetail(client)}
                  >
                    Detalle
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
