"use client"

import React, { useEffect, useState } from "react"

interface TopBarProps {
  onNewPayment: () => void
  onNewClient: () => void
}

export default function TopBar({ onNewPayment, onNewClient }: TopBarProps) {
  const [gymName, setGymName] = useState<string | null>(null)

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      if (typeof window !== "undefined") {
        window.location.href = "/login"
      }
    } catch (e) {
      console.error("Error al cerrar sesión", e)
    }
  }

  useEffect(() => {
    const loadGym = async () => {
      try {
        const res = await fetch("/api/auth/me")
        if (res.ok) {
          const data = await res.json()
          setGymName(data.name)
        } else {
          console.error("No se pudo cargar el gym logueado")
        }
      } catch (e) {
        console.error("Error cargando gym:", e)
      }
    }

    loadGym()
  }, [])

  return (
    <header className="flex items-center justify-between px-8 pt-6 pb-4">
      {/* IZQUIERDA: Nombre del proyecto + owner */}
      <div className="flex items-baseline gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-wide text-slate-900">
            ISIPICI
          </span>
          <span className="h-4 w-px bg-slate-300" />
          <span className="text-xs text-slate-500">
            {gymName ? gymName : "Cargando owner..."}
          </span>
        </div>
      </div>

      {/* DERECHA: Botones + logout */}
      <div className="flex items-center gap-3">
        <button
          onClick={onNewPayment}
          className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 transition-colors"
        >
          Registrar pago
        </button>

        <button
          onClick={onNewClient}
          className="rounded-full bg-white/90 px-5 py-2 text-sm font-medium text-slate-900 border border-slate-200 hover:bg-white transition-colors"
        >
          Agregar cliente
        </button>

        <div className="h-6 w-px bg-slate-300 mx-1" />

        <button
          onClick={handleLogout}
          className="px-2 text-xs font-medium text-slate-500 hover:text-red-600 transition-colors"
          title="Cerrar sesión"
        >
          Salir
        </button>
      </div>
    </header>
  )
}
