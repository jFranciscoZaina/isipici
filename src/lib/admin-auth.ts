import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import jwt from "jsonwebtoken"

export const ADMIN_COOKIE = "isipici_admin"
export async function requireAdmin() {
  const secret = process.env.ADMIN_JWT_SECRET
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const token = (await cookies()).get(ADMIN_COOKIE)?.value
  if (secret && secret.length >= 32 && secret !== process.env.JWT_SECRET && email && token) {
    try {
      const payload = jwt.verify(token, secret, { algorithms: ["HS256"], audience: "isipici-admin", issuer: "isipici" })
      if (typeof payload !== "string" && payload.sub === email && payload.role === "operator") return email
    } catch { /* Sesión inválida: fallar cerrado. */ }
  }
  redirect("/admin/login")
}
