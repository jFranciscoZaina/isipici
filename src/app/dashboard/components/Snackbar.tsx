"use client"

import React, { useEffect } from "react"
import {useI18n} from "../../I18nProvider"

type SnackbarProps = {
  message: string
  type?: "loading" | "success" | "error"
  onClose: () => void
  managed?: boolean
  duration?: number
}

export default function Snackbar({
  message,
  type = "success",
  onClose,
  duration = 4000,
  managed = false,
}: SnackbarProps) {
  const {t}=useI18n()
  useEffect(() => {
    if (managed || type === "loading") return
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [onClose, duration, type, managed])

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
          role={type === "error" ? "alert" : "status"}
          aria-live={type === "error" ? "assertive" : "polite"}
          className={`${base} ${bg} animate-slide-up pointer-events-auto`}
          style={{
            animationDuration: "300ms",
            animationFillMode: "forwards",
          }}
        >
          {type === "loading" && <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border-2 border-current border-r-transparent animate-spin"/>}
          {message}
          {type !== "loading" && <button
            aria-label={t("common.close")}
            onClick={onClose}
            className="ml-auto text-white/80 hover:text-white"
          >
            x
          </button>}
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
