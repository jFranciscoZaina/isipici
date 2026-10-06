import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import { getSessionOwnerId } from "@/lib/auth"

// PATCH /api/clients/:id -> actualizar datos del cliente del owner logueado
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const ownerId = getSessionOwnerId(req)

  if (!ownerId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await ctx.params
  const clientId = id

  if (!clientId) {
    return NextResponse.json(
      { error: "Falta id de cliente" },
      { status: 400 }
    )
  }

  const { email, phone, address, addressNumber, dueDay } = await req.json()

  const { data, error } = await supabase
    .from("clients")
    .update({
      email,
      phone,
      address,
      address_number: addressNumber,
      due_day: dueDay,
    })
    .eq("id", clientId)
    .eq("owner_id", ownerId)
    .select()
    .maybeSingle()

  if (error) {
    console.error("Supabase update client error:", error)
    return NextResponse.json(
      { error: "Error actualizando cliente" },
      { status: 500 }
    )
  }

  if (!data) {
    return NextResponse.json(
      { error: "Cliente no encontrado" },
      { status: 404 }
    )
  }

  return NextResponse.json(data)
}

// DELETE /api/clients/:id -> eliminar cliente + pagos (ON DELETE CASCADE)
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const ownerId = getSessionOwnerId(req)

  if (!ownerId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await ctx.params
  const clientId = id

  if (!clientId) {
    return NextResponse.json(
      { error: "Falta id de cliente" },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("clients")
    .delete()
    .eq("id", clientId)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("Supabase delete client error:", error)
    return NextResponse.json(
      { error: "Error eliminando cliente" },
      { status: 500 }
    )
  }

  if (!data) {
    return NextResponse.json(
      { error: "Cliente no encontrado" },
      { status: 404 }
    )
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
