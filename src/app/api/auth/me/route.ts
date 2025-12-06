import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import { getSessionOwnerId } from "@/lib/auth"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const ownerId = getSessionOwnerId(req)

  if (!ownerId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("owners")
    .select("id, name, email")
    .eq("id", ownerId)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: "Owner no encontrado" },
      { status: 404 }
    )
  }

  return NextResponse.json(data)
}
