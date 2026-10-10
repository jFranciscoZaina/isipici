import "server-only"
import bcrypt from "bcryptjs"
import { supabase } from "@/lib/supabaseClient"

type OwnerResult = { data: { id: string; name: string; email: string } } | { error: string; status: number }
export async function createOwner(input: unknown, configuration: { defaultCurrency: "ARS" | "AUD" } = { defaultCurrency: "ARS" }): Promise<OwnerResult> {
  if (!["ARS", "AUD"].includes(configuration.defaultCurrency)) return { error: "Moneda inválida", status: 400 }
  const body = input as Record<string, unknown> | null
  if (!body || typeof body.name !== "string" || typeof body.email !== "string" || typeof body.password !== "string") return { error: "Nombre, email y contraseña son obligatorios", status: 400 } as const
  const name = body.name.trim()
  const email = body.email.trim().toLowerCase()
  if (body.pin !== undefined && (typeof body.pin !== "string" || !/^\d{4}$/.test(body.pin))) return { error: "El PIN debe tener cuatro dígitos", status: 400 }
  if (!name || name.length > 200 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || body.password.length < 12 || Buffer.byteLength(body.password, "utf8") > 72) return { error: "Datos inválidos. Contraseña: mínimo 12 caracteres y máximo 72 bytes.", status: 400 } as const
  const existing = await supabase.from("owners").select("id").ilike("email", email.replace(/[\\%_]/g, "\\$&")).maybeSingle()
  if (existing.error) return { error: "No se pudo crear la cuenta", status: 500 }
  if (existing.data) return { error: "Ya existe una cuenta con ese email", status: 409 }
  const pinFields = typeof body.pin === "string" ? { pin_hash: await bcrypt.hash(body.pin, 12) } : {}
  const { data, error } = await supabase.from("owners").insert({ name, email, default_currency: configuration.defaultCurrency, password_hash: await bcrypt.hash(body.password, 12), ...pinFields }).select("id, name, email").single()
  if (error || !data) return { error: error?.code === "23505" ? "Ya existe una cuenta con ese email" : "No se pudo crear la cuenta", status: error?.code === "23505" ? 409 : 500 } as const
  return { data } as const
}
