"use client";

import React, { useEffect, useState } from "react";
import { DollarSign, User } from "react-feather";

interface TopBarProps {
  onNewPayment: () => void;
  onNewClient: () => void;
}

export default function TopBar({ onNewPayment, onNewClient }: TopBarProps) {
  const [gymName, setGymName] = useState<string | null>(null);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    } catch (e) {
      console.error("Error al cerrar sesión", e);
    }
  };

  useEffect(() => {
    const loadGym = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setGymName(data.name);
        } else {
          console.error("No se pudo cargar el gym logueado");
        }
      } catch (e) {
        console.error("Error cargando gym:", e);
      }
    };

    loadGym();
  }, []);

  return (
    <header className="flex items-center justify-between px-10 p-p10 pb-4 text-app">
      {/* IZQUIERDA: nombre del producto + owner */}
      <div className="flex items-baseline gap-3 items-center">
        <span className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-accent-primary)] uppercase">
          ISIPICI
        </span>

        <span className="h-5 w-px bg-bg3" />

        <span className="text-xs text-app-secondary">
          {gymName ?? "Fran Zaina from Abllle.com"}
        </span>
      </div>

      {/* DERECHA: CTAs + logout */}
      <div className="flex items-center gap-p40">
        {/* Registrar pago */}
        <button onClick={onNewPayment} className="btn-primary">
          <DollarSign className="h-4 w-4" strokeWidth={2} />
          <span>Registrar pago</span>
        </button>

        {/* Agregar cliente */}
        <button onClick={onNewClient} className="btn-primary">
          <User className="h-4 w-4" strokeWidth={2} />
          <span>Agregar cliente</span>
        </button>

        {/* Separador + logout */}
        <span className="h-5 w-px bg-bg3" />

        <button
          onClick={handleLogout}
          className="text-xs font-medium text-app-secondary underline-offset-4 hover:text-danger hover:underline"
          title="Cerrar sesión"
        >
          Salir
        </button>
      </div>
    </header>
  );
}
