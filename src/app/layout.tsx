import type { Metadata } from "next"
import "./globals.css"
import { Plus_Jakarta_Sans } from "next/font/google"

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-geist-sans", // 👈 importantísimo: reemplaza la fuente Geist
})

export const metadata: Metadata = {
  title: "ISIPICI",
  description: "Panel de gestión para gimnasios",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={plusJakarta.variable}>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
