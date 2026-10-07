// src/app/api/clients/emails/route.ts
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import { getSessionOwnerId, ownedClientColumn } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    const ownerId = await getSessionOwnerId(req)
    if (!ownerId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get("clientId")

    if (!clientId) {
      return NextResponse.json(
        { error: "clientId is required" },
        { status: 400 }
      )
    }

    if (!await ownedClientColumn(clientId, ownerId)) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    const { data, error } = await supabase
      .from("email_logs")
      .select(
        "id, sent_at, type, subject, due_date, status, delivery_status, delivered_at, opened_at, clicked_at, bounced_at, failed_at, created_at"
      )
      .eq("client_id", clientId)
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error(error)
      return NextResponse.json(
        { error: "Error consultando historial de emails" },
        { status: 500 }
      )
    }

    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error("Email log error:", err)
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    )
  }
}
