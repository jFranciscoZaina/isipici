import "server-only"
import { NextRequest } from "next/server"
import jwt from "jsonwebtoken"
import { supabase } from "@/lib/supabaseClient"

export async function getSessionOwnerId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get("session")?.value
  const secret = process.env.JWT_SECRET
  if (!token || !secret) return null
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] })
    if (typeof decoded === "string" || typeof decoded.ownerId !== "string") return null
    const { data, error } = await supabase.from("owners").select("id, is_active").eq("id", decoded.ownerId).single()
    return !error && data?.is_active === true ? data.id : null
  } catch { return null }
}
export const getSessionGymId = getSessionOwnerId

export async function ownedClientColumn(clientId: string, ownerId: string): Promise<"owner_id" | "gym_id" | null> {
  for (const column of ["owner_id", "gym_id"] as const) {
    const { data, error } = await supabase.from("clients").select("id").eq("id", clientId).eq(column, ownerId).maybeSingle()
    if (!error) return data ? column : null
    if (error.code !== "42703" && error.code !== "PGRST204") return null
  }
  return null
}
