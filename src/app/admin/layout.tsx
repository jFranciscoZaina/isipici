import type { ReactNode } from "react"
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <main className="min-h-screen p-p30 bg-[var(--color-bg-bg0)] text-[var(--color-text)]"><div className="max-w-6xl mx-auto space-y-6">{children}</div></main>
}
