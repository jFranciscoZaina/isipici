import React from "react"
import { ToastProvider } from "./components/ToastProvider"
import { redirect } from "next/navigation"
import { getAccessContext } from "@/lib/auth"
import { verifiedModernUser } from "@/lib/supabase-auth"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!await getAccessContext()) {
    if(await verifiedModernUser())redirect("/api/auth/continue")
    redirect("/login")
  }
  return <ToastProvider>{children}</ToastProvider>
}
