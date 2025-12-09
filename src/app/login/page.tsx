// src/app/login/page.tsx
"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image";
import isipiciLogo from "../isipici.svg";

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data?.error || "Error al iniciar sesión")
        setLoading(false)
        return
      }

      // Si todo ok, redirigir al dashboard
      router.push("/dashboard")
    } catch (err) {
      console.error(err)
      setError("Error inesperado, intentá de nuevo")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-200 px-4">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-xl border border-slate-100 p-8">
       <span className="text-sm font-semibold tracking-[0.18em] text-[color:var(--color-accent-primary)] flex justify-center pb-p20">
           
              <Image
                src={isipiciLogo}
                alt="ISIPICI"
                width={24}
                height={24}
                className="h-6 w-30"
              />
            
          </span>
        <p className="text-sm text-slate-500 mb-6">
          Inicia sesión con la cuenta de tu negocio para ver tus clientes y pagos.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Email
            </label>
            <input
              type="email"
             className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app placeholder:text-app-secondary"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Contraseña
            </label>
            <input
              type="password"
             className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app placeholder:text-app-secondary"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-slate-900 text-white text-sm font-medium py-2.5 mt-2 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Ingresando..." : "Iniciar sesión"}
          </button>
        </form>

        <p className="mt-6 text-[11px] text-slate-400">
          Si todavía no tenés cuenta de negocio, contactanos. Es GRATIS!
        </p>
      </div>
    </div>
  )
}
