"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Eye, EyeOff, ArrowLeft } from "react-feather"

function GoogleMark(){
  return <svg aria-hidden="true" viewBox="0 0 18 18" className="h-[18px] w-[18px] shrink-0"><path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.874 2.684-6.614Z"/><path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.91-2.258c-.805.54-1.834.859-3.046.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.963 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.167.281-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.45.347 2.824.956 4.038l3.007-2.332Z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.507.454 3.44 1.345l2.582-2.582C13.464.891 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z"/></svg>
}
import {useSubmissionLock} from "../dashboard/components/useSubmissionLock"
import isipiciLogo from "../isipici.svg"
import {useI18n} from "../I18nProvider"

export default function LoginPage() {
  const {t}=useI18n()
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
        setError(data?.error || t("login.error"))
        return
      }

      window.location.assign("/dashboard")
    } catch (err) {
      console.error(err)
      setError(t("login.error"))
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
      if(!response.ok)throw new Error(data.error??t("login.googleError"))
      window.location.assign(data.url)
    }catch(e){setError(e instanceof Error?e.message:t("login.googleError"));setLoading(false);submission.release()}
  }
  React.useEffect(()=>{if(new URLSearchParams(window.location.search).has("authError"))setError(t("login.googleError"))},[])
  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-200 px-4 relative">
        <div className="w-full max-w-md rounded-3xl bg-white shadow-xl border border-slate-100 p-8 text-sm text-slate-500">
          {t("login.checking")}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-200 px-4 relative">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-xl border border-slate-100 p-8">
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft size={18} />
            <span>{t("login.back")}</span>
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
          {t("login.body")}
        </p>

        <button type="button" disabled={loading} onClick={startGoogle} className="inline-flex w-full items-center justify-center gap-p10 rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app shadow-sm transition-colors hover:bg-bg1 disabled:cursor-not-allowed disabled:opacity-60" style={{backgroundColor:"var(--n)"}}><GoogleMark/><span>{t("login.google")}</span></button>
        <p className="text-app-secondary text-center py-p10">──────── {t("login.or")} ────────</p>
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
              {t("login.password")}
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
                aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
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
            {loading ? t("login.submitting") : t("login.submit")}
          </button>
        </form>

        <p className="mt-6 text-[11px] text-slate-400">
          {t("login.footer")}
        </p>
      </div>
    </div>
  )
}
