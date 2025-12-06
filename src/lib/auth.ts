import { NextRequest } from "next/server"
import jwt from "jsonwebtoken"

const rawJwtSecret = process.env.JWT_SECRET

if (!rawJwtSecret) {
  throw new Error("JWT_SECRET no está definido en .env")
}

const JWT_SECRET: string = rawJwtSecret

type SessionPayload = {
  ownerId: string
  email: string
  iat: number
  exp: number
}

export function getSessionOwnerId(req: NextRequest): string | null {
  const token = req.cookies.get("session")?.value
  if (!token) return null

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as SessionPayload
    return decoded.ownerId
  } catch (err) {
    console.error("Error verificando JWT:", err)
    return null
  }
}

// Compatibilidad temporal con imports antiguos
export const getSessionGymId = getSessionOwnerId
