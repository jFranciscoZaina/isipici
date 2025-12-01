import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"

// PATCH /api/clients/:id  -> actualizar datos del cliente
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
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
    .select()
    .single()

  if (error) {
    console.error("Supabase update client error:", error)
    return NextResponse.json(
      { error: "Error actualizando cliente" },
      { status: 500 }
    )
  }

  return NextResponse.json(data)
}

// DELETE /api/clients/:id  -> eliminar cliente + pagos (ON DELETE CASCADE)
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const clientId = id

  if (!clientId) {
    return NextResponse.json(
      { error: "Falta id de cliente" },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", clientId)

  if (error) {
    console.error("Supabase delete client error:", error)
    return NextResponse.json(
      { error: "Error eliminando cliente" },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
