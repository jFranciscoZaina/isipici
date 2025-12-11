// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "Gestioná clientes, pagos y vencimientos de tu gimnasio, club, instituto, etc. desde un solo lugar. isipici es el panel de control pensado para el día a día.",
  description: "Panel de gestión para gimnasios: clientes, pagos y deudas en un solo lugar.",
  metadataBase: new URL("https://www.isipici.com"),
  icons: {
    icon: [
      { url: "/favicon.svg" },
      { url: "/favicon.ico", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "isipici",
    description:
      "Gestioná clientes, pagos y deudas de tu gimnasio, club, instituto, etc. con un dashboard simple y claro.",
    url: "https://www.isipici.com",
    siteName: "isipici",
    images: [
      {
        url: "/isipici-busqueda.png",
        width: 1200,
        height: 630,
        alt: "isipici - gestor de clientes y pagos para gimnasio, club, instituto, etc.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "isipici",
    description:
      "Administra clientes, pagos y deudas con un dashboard pensado para el día a día del gimnasio, club, instituto, etc..",
    images: ["/isipici-busqueda.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={plusJakarta.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
