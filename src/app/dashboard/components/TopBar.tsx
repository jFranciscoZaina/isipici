"use client";

import React, { useEffect, useState } from "react";
import { DollarSign, UserPlus, Menu } from "react-feather";

interface TopBarProps {
  onNewPayment: () => void;
  onNewClient: () => void;
}

export default function TopBar({ onNewPayment, onNewClient }: TopBarProps) {
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
    const loadOwner = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setOwnerName(data.name);
        } else {
          console.error("No se pudo cargar el owner logueado");
        }
      } catch (e) {
        console.error("Error cargando owner:", e);
      }
    };

    loadOwner();

    const update = () => setIsMobile(window.innerWidth < 640);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <>
      <header className="flex items-center justify-between px-10 p-p10 pb-4 text-app sm:px-10 px-p10">
        {/* Izquierda: marca + owner */}
        <div className="flex items-baseline gap-3 items-center">
          <span className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-accent-primary)] uppercase">
            ISIPICI
          </span>
          <span className="h-5 w-px bg-bg3" />
          <span className="text-xs text-app-secondary">
            {ownerName ?? "Owner invitado"}
          </span>
        </div>

        {/* Derecha: botones desktop / menú mobile */}
        <div className="flex items-center gap-p40">
          {!isMobile && (
            <div className="flex items-center gap-p20">
              <button onClick={onNewPayment} className="btn-primary">
                <DollarSign className="h-4 w-4" strokeWidth={2} />
                <span>Registrar pago</span>
              </button>
              <button onClick={onNewClient} className="btn-primary">
                <UserPlus className="h-4 w-4" strokeWidth={2} />
                <span>Agregar cliente</span>
              </button>
              <span className="h-5 w-px bg-bg3" />
              <button
                onClick={handleLogout}
                className="text-xs font-medium text-app-secondary underline-offset-4 hover:text-danger hover:underline"
                title="Cerrar sesión"
              >
                Salir
              </button>
            </div>
          )}

          {isMobile && (
            <button
              type="button"
              onClick={() => setShowSheet(true)}
              className="inline-flex items-center justify-center rounded-full p-2 hover:bg-bg2"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {/* Action sheet mobile */}
      {showSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:hidden bg-black/60 "
          onClick={() => setShowSheet(false)}
        >
          <div
            className="w-full bg-bg1 rounded-t-3xl p-p40 shadow-2xl flex flex-col gap-p20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center fs-14 text-app font-semibold">
              {ownerName ?? "Owner invitado"}
            </div>

            <button
              onClick={() => {
                setShowSheet(false);
                onNewPayment();
              }}
              className="w-full btn-primary justify-center py-p12 fs-14"
            >
              <DollarSign className="h-4 w-4" strokeWidth={2} />
              <span>Registrar pago</span>
            </button>

            <button
              onClick={() => {
                setShowSheet(false);
                onNewClient();
              }}
              className="w-full btn-primary justify-center py-p12 fs-14"
            >
              <UserPlus className="h-4 w-4" strokeWidth={2} />
              <span>Agregar cliente</span>
            </button>

            <button
              onClick={() => {
                setShowSheet(false);
                handleLogout();
              }}
              className="w-full text-center fs-14 text-app-secondary hover:text-danger py-p10"
            >
              Salir
            </button>
          </div>
        </div>
      )}
    </>
  );
}
