"use client"

import React, { useEffect } from "react"

type SnackbarProps = {
  message: string
  type?: "success" | "error"
  onClose: () => void
  duration?: number
}

export default function Snackbar({
  message,
  type = "success",
  onClose,
  duration = 4000,
}: SnackbarProps) {
  useEffect(() => {
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [onClose, duration])

  const base =
    "min-w-[260px] max-w-[360px] rounded-full px-p20 py-p10 shadow-lg text-[12px] font-medium text-white flex items-center gap-p10"
  const bg =
    type === "error"
      ? "bg-red-600"
      : "bg-[color:var(--n8)]"

  return (
    <div className="fixed inset-x-0 bottom-0 z-[12000] pointer-events-none">
      <div className="flex justify-center pb-p10">
        <div
          className={`${base} ${bg} animate-slide-up pointer-events-auto`}
          style={{
            animationDuration: "300ms",
            animationFillMode: "forwards",
          }}
        >
          {message}
          <button
            aria-label="Cerrar"
            onClick={onClose}
            className="ml-auto text-white/80 hover:text-white"
          >
            x
          </button>
        </div>
      </div>
      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(40%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
