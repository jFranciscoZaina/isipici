import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(_req: NextRequest) {
  void _req
  const res = NextResponse.json({ ok: true })

  // Borrar cookie de sesión
  res.cookies.set("session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })

  return res
}
