import "server-only"
import { requireAdmin } from "@/lib/admin-auth"
import { supabase } from "@/lib/supabaseClient"

export async function ownerSummary(id: string) {
  await requireAdmin()
  const { data, error } = await supabase.from("owners").select("id, name, email, created_at, is_active, default_currency").eq("id", id).maybeSingle()
  if (error) throw new Error("No se pudo consultar la cuenta")
  if (!data) return null
  const optional: Record<string, string | null> = {}
  for (const field of ["country", "business_type"]) {
    const result = await supabase.from("owners").select(field).eq("id", id).single()
    if (result.error && !["42703", "PGRST204"].includes(result.error.code)) throw new Error("No se pudo consultar la cuenta")
    const row = result.data as unknown as Record<string, unknown> | null
    optional[field] = typeof row?.[field] === "string" ? row[field] as string : null
  }
  let clients = await supabase.from("clients").select("id", { count: "exact", head: true }).eq("owner_id", id)
  if (clients.error && ["42703", "PGRST204"].includes(clients.error.code)) clients = await supabase.from("clients").select("id", { count: "exact", head: true }).eq("gym_id", id)
  if (clients.error) throw new Error("No se pudieron contar los clientes")
  return { ...data, country: optional.country, business_type: optional.business_type, clientCount: clients.count ?? 0 }
}
