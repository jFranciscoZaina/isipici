// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "isipici – gestor de clientes y pagos para gimnasios",
  description: "Panel de gestión para gimnasios: clientes, pagos y deudas en un solo lugar.",
  metadataBase: new URL("https://www.isipici.com"),
  icons: {
    icon: [
      { url: "/favicon.svg" },
      { url: "/favicon.ico", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "isipici – plataforma para gimnasios",
    description:
      "Gestioná clientes, pagos y deudas de tu gimnasio con un dashboard simple y claro.",
    url: "https://www.isipici.com",
    siteName: "isipici",
    images: [
      {
        url: "/isipici-busqueda.png",
        width: 1200,
        height: 630,
        alt: "isipici - gestor de clientes y pagos para gimnasios",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "isipici – gestor de clientes y pagos para gimnasios",
    description:
      "Administra clientes, pagos y deudas con un dashboard pensado para el día a día del gimnasio.",
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
