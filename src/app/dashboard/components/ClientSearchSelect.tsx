"use client"

import { useMemo, useState } from "react"
import type { ClientRow } from "../page"

type Props = {
  clients: ClientRow[]
  selectedClientId: string
  onSelectClient: (id: string) => void
}

export default function ClientSearchSelect({
  clients,
  selectedClientId,
  onSelectClient,
}: Props) {
  const [search, setSearch] = useState("")
  const [isOpen, setIsOpen] = useState(false)

  const selectedLabel = useMemo(() => {
    if (!selectedClientId) return ""
    const c = clients.find((cl) => cl.id === selectedClientId)
    return c ? `${c.name}${c.email ? ` — ${c.email}` : ""}` : ""
  }, [clients, selectedClientId])

  // Filtrado local por nombre / email (sin llamadas a la API)
  const filteredClients = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return []
    return clients.filter((c) => {
      const name = c.name?.toLowerCase() ?? ""
      const email = c.email?.toLowerCase() ?? ""
      return name.includes(q) || email.includes(q)
    })
  }, [clients, search])

  const handleSelect = (id: string) => {
    onSelectClient(id)
    const c = clients.find((cl) => cl.id === id)
    if (c) {
      setSearch(`${c.name}${c.email ? ` — ${c.email}` : ""}`)
    }
    setIsOpen(false)
  }

  const inputValue = search || selectedLabel

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-900">
        Persona
      </label>

      <div className="relative">
        <input
          type="text"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          placeholder="Buscar por nombre o email..."
          value={inputValue}
          onChange={(e) => {
            const value = e.target.value
            setSearch(value)
            setIsOpen(value.trim().length > 0) // solo abre si escribe
          }}
          onFocus={() => {
            if (inputValue.trim().length > 0) setIsOpen(true)
          }}
        />

        {isOpen && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white max-h-56 overflow-y-auto shadow-sm">
            {filteredClients.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-500">
                No se encontraron clientes.
              </div>
            ) : (
              filteredClients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  // Evitamos que el blur del input cierre antes del click
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(c.id)}
                  className={`w-full text-left px-3 py-2 text-xs md:text-sm hover:bg-slate-50 ${
                    c.id === selectedClientId ? "bg-slate-100 font-medium" : ""
                  }`}
                >
                  {c.name}
                  {c.email ? ` — ${c.email}` : ""}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
