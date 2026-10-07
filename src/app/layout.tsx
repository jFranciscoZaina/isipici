// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import PWARegister from "./PWARegister";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "isipici · Gestión de clientes y pagos",
  description: "Clientes, pagos y vencimientos en un solo lugar para pequeños negocios y organizaciones.",
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
      "Gestioná clientes, pagos y deudas de tu organización con un dashboard simple y claro.",
    url: "https://www.isipici.com",
    siteName: "isipici",
    images: [
      {
        url: "/isipici-busqueda.png",
        width: 1200,
        height: 630,
        alt: "isipici - gestión de clientes y pagos",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "isipici",
    description:
      "Administrá clientes, pagos y deudas con un dashboard pensado para el día a día de tu organización.",
    images: ["/isipici-busqueda.png"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "isipici",
  },
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={plusJakarta.variable}>
      <body className="font-sans antialiased">
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
