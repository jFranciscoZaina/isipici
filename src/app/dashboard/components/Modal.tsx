"use client"

import React from "react"

type ModalSize = "small" | "normal" | "large"

const SIZE_CLASSES: Record<ModalSize, string> = {
  small: "max-w-xl",        // ~480–600px
  normal: "max-w-3xl",      // como ahora
  large: "max-w-5xl",       // más ancho para formularios grandes
}

type ModalProps = {
  children: React.ReactNode
  onClose: () => void
  className?: string
  size?: ModalSize
}

export default function Modal({
  children,
  onClose,
  className = "",
  size = "normal",
}: ModalProps) {
  const maxWidth = SIZE_CLASSES[size]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className={`relative w-full ${maxWidth} rounded-lg bg-white p-0 shadow-xl overflow-hidden ${className}`}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 text-slate-400 hover:text-slate-700"
          aria-label="Cerrar modal"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}
