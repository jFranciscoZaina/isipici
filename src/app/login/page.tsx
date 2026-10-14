"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Eye, EyeOff, ArrowLeft } from "react-feather"
import {useSubmissionLock} from "../dashboard/components/useSubmissionLock"
import isipiciLogo from "../isipici.svg"

export default function LoginPage() {
  const router = useRouter()
  const submission=useSubmissionLock()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  // Si ya hay session, redirigir al dashboard
  React.useEffect(() => {
    const verify = async () => {
      try {
        const res = await fetch("/api/auth/me", { method: "GET" })
        if (res.ok) {
          const data=await res.json()
          window.location.assign(data.next??"/dashboard")
          return
        }
      } catch {
        // ignore, mostramos el login
      } finally {
        setCheckingSession(false)
      }
    }
    verify()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if(!submission.acquire())return
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

      window.location.assign("/dashboard")
    } catch (err) {
      console.error(err)
      setError("Error inesperado, intenta de nuevo")
    } finally {
      submission.release()
      setLoading(false)
    }
  }

  const startGoogle=async()=>{
    if(!submission.acquire())return
    setLoading(true);setError(null)
    try{
      const response=await fetch("/api/auth/google",{method:"POST"}),data=await response.json()
      if(!response.ok)throw new Error(data.error??"No se pudo iniciar Google")
      window.location.assign(data.url)
    }catch(e){setError(e instanceof Error?e.message:"No se pudo iniciar Google");setLoading(false);submission.release()}
  }
  React.useEffect(()=>{if(new URLSearchParams(window.location.search).has("authError"))setError("No se pudo completar el acceso con Google. Intentá nuevamente.")},[])
  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-200 px-4">
        <div className="w-full max-w-md rounded-3xl bg-white shadow-xl border border-slate-100 p-8 text-sm text-slate-500">
          Verificando sesion...
        </div>
      </div>
    )
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

        <button type="button" disabled={loading} onClick={startGoogle} className="btn-primary w-full">Continuar con Google</button>
        <p className="text-app-secondary text-center py-p10">──────── o ────────</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Email
            </label>
            <div className="relative">
              <input
                type="email"
                className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 pr-12 fs-14 text-app placeholder:text-app-secondary"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
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
