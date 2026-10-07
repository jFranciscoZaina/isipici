import { NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { createOwner } from "@/lib/owner-registration"
export const runtime = "nodejs"
export async function POST(req: NextRequest) {
  const secret = process.env.JWT_SECRET
  if (!secret) return NextResponse.json({ error: "Registro no disponible" }, { status: 503 })
  let input: unknown
  try { input = await req.json() } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }) }
  try {
    const result = await createOwner(input)
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })
    const res = NextResponse.json(result.data, { status: 201 })
    res.cookies.set("session", jwt.sign({ ownerId: result.data.id, email: result.data.email }, secret, { expiresIn: "7d", algorithm: "HS256" }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 604800 })
    return res
  } catch { return NextResponse.json({ error: "No se pudo crear la cuenta" }, { status: 500 }) }
}
