"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import type { ClientRow } from "../page";
import { Trash2, DollarSign, UserPlus, CreditCard, Mail } from "react-feather";

export type ClientMenuAction =
  | "delete"
  | "registerPayment"
  | "editProfile"
  | "paymentsHistory"
  | "emailsHistory";

type Props = {
  client: ClientRow | null;
  position: { top: number; left: number } | null;
  onClose: () => void;
  onAction: (action: ClientMenuAction, client: ClientRow) => void;
};

export function ClientContextMenu({
  client,
  position,
  onClose,
  onAction,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [adjustedTop, setAdjustedTop] = useState<number | null>(null);

  // Cerrar con click afuera o ESC
  useEffect(() => {
    if (!client || !position) return;

    const handleClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [client, position, onClose]);

  // Ajustar posición vertical para que nunca se salga de la ventana
  useEffect(() => {
    if (!client || !position) return;

    const margin = 16; // px de margen respecto al borde de la pantalla

    // esperamos al próximo frame para asegurarnos de que el menú tenga altura
    const raf = requestAnimationFrame(() => {
      if (!ref.current) return;

      const menuHeight = ref.current.offsetHeight;
      const viewportHeight = window.innerHeight;
      const scrollY = window.scrollY;

      let top = position.top;
      const bottom = top + menuHeight;

      const maxBottom = scrollY + viewportHeight - margin;
      const minTop = scrollY + margin;

      if (bottom > maxBottom) {
        top -= bottom - maxBottom; // lo subimos
      }
      if (top < minTop) {
        top = minTop; // lo bajamos si nos pasamos por arriba
      }

      setAdjustedTop(top);
    });

    return () => cancelAnimationFrame(raf);
  }, [client, position]);

  if (!client || !position) return null;

  const items: {
    id: ClientMenuAction;
    label: string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    tone?: "danger";
  }[] = [
    { id: "registerPayment", label: "Registrar pago", icon: DollarSign },
    { id: "editProfile", label: "Editar perfil", icon: UserPlus },
    { id: "paymentsHistory", label: "Historial de pagos", icon: CreditCard },
    { id: "emailsHistory", label: "Historial de emails", icon: Mail },
    { id: "delete", label: "Eliminar cliente", icon: Trash2, tone: "danger" },
  ];

  const top = adjustedTop ?? position.top;

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <div
        ref={ref}
        className="pointer-events-auto rounded-br10 border border-n2 bg-bg0 shadow-lg w-[240px]"
        style={{
          position: "absolute",
          top,
          left: position.left,
          transform: "translateX(-100%)",
        }}
      >
        <ul className="px-p20 py-p20 space-y-p30">
          {items.map(({ id, label, icon: Icon, tone }) => (
            <li key={id}>
              <button
                type="button"
                className={`flex w-full items-center gap-p20 rounded-br10 px-p10 py-p10 text-left fs-14 bg-bg0 transition-colors hover:bg-bg1 hover:cursor-pointer ${
                  tone === "danger" ? "text-danger" : "text-app"
                } hover:bg-bg1`}
                onClick={() => {
                  onAction(id, client);
                  onClose();
                }}
              >
                <Icon className="h-5 w-5 stroke-[2.2]" />
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
