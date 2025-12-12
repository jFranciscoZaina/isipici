import React from "react"
import PinLockGate from "./components/PinLockGate"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PinLockGate>{children}</PinLockGate>
}
