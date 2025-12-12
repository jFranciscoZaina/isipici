import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"

export const runtime = "nodejs"

const rawJwtSecret = process.env.JWT_SECRET

if (!rawJwtSecret) {
  throw new Error("JWT_SECRET no esta definido en .env")
}

const JWT_SECRET: string = rawJwtSecret
const JWT_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7 // 7 dias

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: "Faltan campos: email, password" },
        { status: 400 }
      )
    }

    const trimmedEmail = String(email).trim()

    const { data, error } = await supabase
      .from("owners")
      .select("id, name, email, password_hash")
      .eq("email", trimmedEmail)
      .single()

    if (error || !data) {
      console.error("Supabase owners select error:", error)
      return NextResponse.json(
        { error: "Credenciales invalidas" },
        { status: 401 }
      )
    }

    const isValid = await bcrypt.compare(password, data.password_hash)

    if (!isValid) {
      return NextResponse.json(
        { error: "Credenciales invalidas" },
        { status: 401 }
      )
    }

    const token = jwt.sign(
      {
        ownerId: data.id,
        email: data.email,
      },
      JWT_SECRET,
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
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 })
  }
}
