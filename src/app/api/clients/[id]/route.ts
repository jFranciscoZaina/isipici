import { NextRequest, NextResponse } from "next/server"
import { getSessionOwnerId, ownedClientColumn } from "@/lib/auth"
import { lifecycleOperation } from "@/lib/payments/lifecycle"
import { PaymentError } from "@/lib/payments/validation"
import { supabase } from "@/lib/supabaseClient"

type Context = { params: Promise<{ id: string }> }
export async function PATCH(req: NextRequest, ctx: Context) {
  const ownerId = await getSessionOwnerId(req)
  if (!ownerId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await ctx.params
  const column = await ownedClientColumn(id, ownerId)
  if (!column) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }) }
  const { email, phone, address, addressNumber, dueDay } = body
  const { data, error } = await supabase.from("clients").update({ email, phone, address, address_number: addressNumber, due_day: dueDay }).eq("id", id).eq(column, ownerId).select().single()
  if (error) return NextResponse.json({ error: "Error actualizando cliente" }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, ctx: Context) {
  const ownerId = await getSessionOwnerId(req)
  if (!ownerId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await ctx.params
  const column = await ownedClientColumn(id, ownerId)
  if (!column) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
  try { return NextResponse.json(await lifecycleOperation(ownerId,id,{action:"archive"})) }
  catch (e) { return NextResponse.json({error:e instanceof PaymentError?e.message:"No se pudo dar de baja"},{status:e instanceof PaymentError?e.status:503}) }
}
