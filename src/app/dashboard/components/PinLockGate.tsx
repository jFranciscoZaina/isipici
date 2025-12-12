"use client"

import React, { useEffect, useMemo, useState } from "react"

const UNLOCK_KEY = "isipici_unlocked"

export default function PinLockGate({ children }: { children: React.ReactNode }) {
  const [authChecked, setAuthChecked] = useState(false)
  const [authorized, setAuthorized] = useState(false)
  const [unlockTick, setUnlockTick] = useState(0)

  const [pin, setPin] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isUnlocked = useMemo(() => {
    if (typeof window === "undefined") return false
    return window.sessionStorage.getItem(UNLOCK_KEY) === "1"
  }, [authChecked, unlockTick])

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/auth/me", { method: "GET" })
        if (res.status === 401) {
          sessionStorage.removeItem(UNLOCK_KEY)
          window.location.href = "/login"
          return
        }
        setAuthorized(true)
      } catch {
        sessionStorage.removeItem(UNLOCK_KEY)
        window.location.href = "/login"
        return
      } finally {
        setAuthChecked(true)
      }
    }
    run()
  }, [])

  const submitPin = async () => {
    setError(null)

    if (!/^\d{4}$/.test(pin.trim())) {
      setError("Ingresa un PIN de 4 digitos.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/auth/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      })

      if (res.ok) {
        sessionStorage.setItem(UNLOCK_KEY, "1")
        setPin("")
        setError(null)
        setUnlockTick((v) => v + 1) // fuerza re-evaluar isUnlocked
        return
      }

      const data = await res.json().catch(() => ({}))
      setError(data?.error || "No se pudo validar el PIN.")
    } catch {
      setError("No se pudo validar el PIN.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!authChecked) return null
  if (!authorized) return null
  if (isUnlocked) return <>{children}</>

  return (
    <div className="relative w-full h-full">
      {children}

      <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center px-[var(--p20)]">
        <div className="w-full max-w-md rounded-br25 bg-bg0 text-app shadow-xl border border-n1 p-p20">
          <div className="flex flex-col gap-p10">
            <h1 className="text-3xl font-extrabold tracking-tight text-app">Ingresar PIN</h1>
            <p className="text-sm text-app-secondary">
              Para acceder a tu panel, ingresa tu PIN de 4 digitos.
            </p>

            <div className="flex flex-col gap-p10 mt-p10">
              <input
                value={pin}
                onChange={(e) => {
                  const next = e.target.value.replace(/[^\d]/g, "").slice(0, 4)
                  setPin(next)
                  setError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitPin()
                }}
                inputMode="numeric"
                type="password"
                placeholder="----"
                className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-18 text-app placeholder:text-app-secondary text-center tracking-[0.3em] outline-none"
              />

              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              <button
                onClick={() => void submitPin()}
                disabled={submitting || pin.length !== 4}
                className="w-full rounded-full bg-slate-900 text-white text-sm font-medium py-2.5 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Validando..." : "Entrar"}
              </button>
            </div>

            <p className="text-[11px] text-app-secondary mt-p10">
              Tip: si cerras la pestana o se recarga la app, volvera a pedir el PIN.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
