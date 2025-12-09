import type { Metadata } from "next";
import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import React from "react";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-geist-sans", // reemplaza la fuente Geist
});

export const metadata: Metadata = {
  title: "isipici – gestor de clientes y pagos para gimnasios",
  description: "Panel de gestión para gimnasios: clientes, pagos y deudas en un solo lugar.",
  metadataBase: new URL("https://www.isipici.com"),
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/isipici.svg", type: "image/svg+xml" },
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const logoJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "isipici",
    url: "https://www.isipici.com",
    logo: "https://www.isipici.com/isipici.svg",
  };

  return (
    <html lang="es" className={plusJakarta.variable}>
      <head>
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(logoJsonLd) }}
        />
      </head>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
