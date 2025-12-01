import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"

export const runtime = "nodejs"

// Lo tipamos explícitamente como string
const rawJwtSecret = process.env.JWT_SECRET

if (!rawJwtSecret) {
  throw new Error("JWT_SECRET no está definido en .env")
}

const JWT_SECRET: string = rawJwtSecret
const JWT_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7 // 7 días

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: "Faltan campos: email, password" },
        { status: 400 }
      )
    }

    // Buscar gym por email
    const { data, error } = await supabase
      .from("owners")
      .select("id, name, email, password_hash")
      .eq("email", email)
      .single()

    if (error || !data) {
      console.error("Supabase owners select error:", error)
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      )
    }

    const isValid = await bcrypt.compare(password, data.password_hash)

    if (!isValid) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      )
    }

    const token = jwt.sign(
      {
        gymId: data.id,
        email: data.email,
      },
      JWT_SECRET, // ahora es string, TS feliz
      { expiresIn: JWT_EXPIRES_IN_SECONDS }
    )

    const res = NextResponse.json(
      {
        id: data.id,
        name: data.name,
        email: data.email,
      },
      { status: 200 }
    )

    res.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: JWT_EXPIRES_IN_SECONDS,
    })

    return res
  } catch (err) {
    console.error("Unexpected /api/auth/login error:", err)
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    )
  }
}
