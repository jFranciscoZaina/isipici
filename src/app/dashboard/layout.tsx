import React from "react"
import PinLockGate from "./components/PinLockGate"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { NextRequest } from "next/server"
import { getSessionOwnerId } from "@/lib/auth"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const token = (await cookies()).get("session")?.value
  const req = new NextRequest("http://localhost/dashboard", { headers: { cookie: `session=${token ?? ""}` } })
  if (!await getSessionOwnerId(req)) redirect("/login")
  return <PinLockGate>{children}</PinLockGate>
}
