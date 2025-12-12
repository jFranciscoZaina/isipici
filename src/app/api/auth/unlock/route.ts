import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import { getSessionOwnerId } from "@/lib/auth"
import bcrypt from "bcryptjs"

export const runtime = "nodejs"

const MAX_TRIES = 5
const LOCK_MINUTES = 10

export async function POST(req: NextRequest) {
  const ownerId = getSessionOwnerId(req)
  if (!ownerId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  let pin = ""
  try {
    const body = await req.json()
    pin = String(body?.pin ?? "").trim()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  // PIN 4 dígitos
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "PIN inválido" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("owners")
    .select("id, pin_hash, pin_failed_attempts, pin_locked_until")
    .eq("id", ownerId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  if (!data.pin_hash) {
    return NextResponse.json(
      { error: "PIN no configurado" },
      { status: 400 }
    )
  }

  const now = new Date()
  const lockedUntil = data.pin_locked_until ? new Date(data.pin_locked_until) : null
  if (lockedUntil && lockedUntil > now) {
    return NextResponse.json(
      { error: "PIN bloqueado. Intentá más tarde." },
      { status: 429 }
    )
  }

  const ok = await bcrypt.compare(pin, data.pin_hash)

  if (!ok) {
    const nextAttempts = (data.pin_failed_attempts ?? 0) + 1

    if (nextAttempts >= MAX_TRIES) {
      const until = new Date(now.getTime() + LOCK_MINUTES * 60 * 1000).toISOString()

      await supabase
        .from("owners")
        .update({ pin_failed_attempts: 0, pin_locked_until: until })
        .eq("id", ownerId)

      return NextResponse.json(
        { error: "PIN bloqueado. Intentá más tarde." },
        { status: 429 }
      )
    }

    await supabase
      .from("owners")
      .update({ pin_failed_attempts: nextAttempts, pin_locked_until: null })
      .eq("id", ownerId)

    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 })
  }

  // Success: reset lock state
  await supabase
    .from("owners")
    .update({ pin_failed_attempts: 0, pin_locked_until: null })
    .eq("id", ownerId)

  return NextResponse.json({ ok: true }, { status: 200 })
}
