import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import { getSessionGymId } from "@/lib/auth"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const gymId = getSessionGymId(req)

  if (!gymId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("gyms")
    .select("id, name, email")
    .eq("id", gymId)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: "Gym no encontrado" },
      { status: 404 }
    )
  }

  return NextResponse.json(data)
}
