"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { ADMIN_COOKIE, requireAdmin } from "@/lib/admin-auth"
import { createOwner } from "@/lib/owner-registration"
import { supabase } from "@/lib/supabaseClient"

export async function loginAdmin(form: FormData) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const hash = process.env.ADMIN_PASSWORD_HASH
  const secret = process.env.ADMIN_JWT_SECRET
  const password = form.get("password")
  if (!email || !hash || !secret || secret.length < 32 || secret === process.env.JWT_SECRET) redirect("/admin/login?error=config")
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) redirect("/admin/login?error=config")
  const attempt = await supabase.rpc("consume_admin_login_attempt")
  if (attempt.error) redirect("/admin/login?error=config")
  if (attempt.data !== true) redirect("/admin/login?error=limit")
  let valid = false
  if (typeof password === "string" && Buffer.byteLength(password) <= 72) {
    try { valid = await bcrypt.compare(password, hash) } catch { /* Configuración inválida. */ }
  }
  const inputEmail = form.get("email")
  if (typeof inputEmail !== "string" || inputEmail.trim().toLowerCase() !== email || !valid) redirect("/admin/login?error=credentials")
  const token = jwt.sign({ role: "operator" }, secret, { subject: email, audience: "isipici-admin", issuer: "isipici", expiresIn: "1h", algorithm: "HS256" })
  ;(await cookies()).set(ADMIN_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/admin", maxAge: 3600 })
  redirect("/admin")
}

export async function logoutAdmin() {
  await requireAdmin()
  ;(await cookies()).set(ADMIN_COOKIE, "", { path: "/admin", maxAge: 0 })
  redirect("/admin/login")
}

export async function addOwner(form: FormData) {
  await requireAdmin()
  const result = await createOwner({ name: form.get("name"), email: form.get("email"), password: form.get("password"), pin: form.get("pin") })
  if ("error" in result) redirect(`/admin?error=${encodeURIComponent(result.error)}`)
  redirect(`/admin/owners/${result.data.id}`)
}

export async function setOwnerStatus(form: FormData) {
  await requireAdmin()
  const id = form.get("id")
  const active = form.get("active")
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id) || (active !== "true" && active !== "false")) redirect("/admin?error=Datos%20inválidos")
  const { data, error } = await supabase.from("owners").update({ is_active: active === "true" }).eq("id", id).select("id").maybeSingle()
  if (error || !data) redirect("/admin?error=No%20se%20pudo%20actualizar%20la%20cuenta")
  redirect(`/admin/owners/${id}`)
}
