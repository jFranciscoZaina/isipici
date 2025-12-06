import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"
import type { PostgrestError } from "@supabase/supabase-js"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"

export const runtime = "nodejs"

const rawJwtSecret = process.env.JWT_SECRET

if (!rawJwtSecret) {
  throw new Error("JWT_SECRET no está definido en .env")
}

const JWT_SECRET: string = rawJwtSecret
const JWT_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7 // 7 días

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json()

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Faltan campos: name, email, password" },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const { data, error } = await supabase
      .from("owners")
      .insert([
        {
          name,
          email,
          password_hash: passwordHash,
        },
      ])
      .select()
      .single()

    if (error) {
      console.error("Supabase owners insert error:", error)
      const message =
        (error as PostgrestError | null)?.code === "23505"
          ? "Ya existe un gym con ese email"
          : "Error creando gym"

      return NextResponse.json(
        { error: message, details: error.message },
        { status: 400 }
      )
    }

    const token = jwt.sign(
      {
        gymId: data.id,
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
      { status: 201 }
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
    console.error("Unexpected /api/gym/register error:", err)
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    )
  }
}
