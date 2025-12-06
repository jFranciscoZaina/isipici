"use client";

import React from "react";

type ModalSize = "small" | "normal" | "large";

const SIZE_CLASSES: Record<ModalSize, string> = {
  small: "max-w-[460px]",   // modal compacto
  normal: "max-w-[520px]",  // detalle de cliente
  large: "max-w-[1120px]",  // modal ancho (ej: pagos + calendario)
};

type ModalAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type ModalProps = {
  /** Contenido principal (lo que va entre header y footer) */
  children: React.ReactNode;

  /** Header completo (tabs, título, icono, etc.) */
  header?: React.ReactNode;

  /** Acción secundaria (botón negro "Regresar", por ej.) */
  secondaryAction?: ModalAction;

  /** Acción primaria (botón violeta "Guardar cambios", por ej.) */
  primaryAction?: ModalAction;

  /** Cierre general del modal (se suele usar también en secondaryAction) */
  onClose: () => void;

  /** Clases extra para el contenedor del modal */
  className?: string;

  /** Tamaño del modal */
  size?: ModalSize;
};

export default function Modal({
  children,
  header,
  secondaryAction,
  primaryAction,
  onClose,
  className = "",
  size = "normal",
}: ModalProps) {
  const maxWidth = SIZE_CLASSES[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className={`
          relative w-full ${maxWidth}
          h-[640px]
          rounded-br25 bg-bg0 shadow-lg border border-n1
          overflow-hidden
          flex flex-col
          ${className}
        `}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        {header && (
          <header className="flex items-center justify-center border-b border-n2 px-p30 pt-p30 pb-p20">
            {header}
          </header>
        )}

        {/* BODY (scroll interno si se pasa de alto) */}
        <main className="flex-1 overflow-y-auto px-p30 py-p30 text-app">
          {children}
        </main>

        {/* FOOTER (botones) */}
        {(secondaryAction || primaryAction) && (
          <footer className="border-t border-n2 px-p30 py-p20 flex items-center justify-between gap-p20">
            {secondaryAction && (
              <button
                type="button"
                onClick={() => {
                  secondaryAction.onClick();
                  // típicamente secondaryAction == onClose, pero no forzamos nada
                }}
                disabled={secondaryAction.disabled}
                className="
                  w-2/5
                  inline-flex items-center justify-center
                  px-p30 py-p10 rounded-full
                  fs-14 text-center
                  bg-[color:var(--n8)]
                  text-[color:var(--n0)]
                  hover:bg-[color:var(--n7)]
                  transition-colors
                  disabled:opacity-60
                  w-full
                  max-w-[250px]
                "
              >
                {secondaryAction.label}
              </button>
            )}

            {primaryAction && (
              <button
                type="button"
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                className="
                  w-2/5
                  inline-flex items-center justify-center
                  px-p30 py-p10 rounded-full
                  fs-14 text-center
                  btn-primary
                  disabled:opacity-60
                  w-full
                  max-w-[250px]
                "
              >
                {primaryAction.label}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
