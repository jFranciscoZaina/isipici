import { NextRequest, NextResponse } from "next/server"
import { getSessionOwnerId, ownedClientColumn } from "@/lib/auth"
import { supabase } from "@/lib/supabaseClient"

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const ownerId = await getSessionOwnerId(req)
  if (!ownerId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await ctx.params
  const ownerColumn = await ownedClientColumn(id, ownerId)
  if (!ownerColumn) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })

  const { data, error } = await supabase
    .from("email_logs")
    .select("id, sent_at, type, subject, due_date, status")
    .eq("client_id", id)
    .eq("owner_id", ownerId)
    .order("sent_at", { ascending: false })

  if (error) {
    console.error("Supabase email_logs error:", error)
    return NextResponse.json(
      { error: "Error consultando historial de emails" },
      { status: 500 }
    )
  }

  return NextResponse.json({
    emails: data ?? [],
  })
}
