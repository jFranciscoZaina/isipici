"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Eye, EyeOff, ArrowLeft } from "react-feather"
import isipiciLogo from "../isipici.svg"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showEmail, setShowEmail] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
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
        setError(data?.error || "Error al iniciar sesion")
        return
      }

      router.push("/dashboard")
    } catch (err) {
      console.error(err)
      setError("Error inesperado, intenta de nuevo")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-200 px-4">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-xl border border-slate-100 p-8">
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft size={18} />
            <span>Volver</span>
          </Link>
        </div>

        <div className="flex justify-center pb-p20">
          <Image
            src={isipiciLogo}
            alt="ISIPICI"
            width={120}
            height={32}
            className="h-8 w-auto"
          />
        </div>

        <p className="text-sm text-slate-500 mb-6">
          Inicia sesion con la cuenta de tu negocio para ver tus clientes y pagos.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Email
            </label>
            <div className="relative">
              <input
                type={showEmail ? "text" : "password"}
                className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 pr-12 fs-14 text-app placeholder:text-app-secondary"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <button
                type="button"
                aria-label={showEmail ? "Ocultar email" : "Mostrar email"}
                className="absolute inset-y-0 right-3 flex items-center text-slate-500"
                onClick={() => setShowEmail((v) => !v)}
              >
                {showEmail ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Contrasena
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 pr-12 fs-14 text-app placeholder:text-app-secondary"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                className="absolute inset-y-0 right-3 flex items-center text-slate-500"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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
            {loading ? "Ingresando..." : "Iniciar sesion"}
          </button>
        </form>

        <p className="mt-6 text-[11px] text-slate-400">
          Si todavia no tenes cuenta de negocio, contactanos. Es GRATIS!
        </p>
      </div>
    </div>
  )
}
