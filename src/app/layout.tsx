import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import {cookies,headers} from "next/headers";
import PWARegister from "./PWARegister";
import NumberInputScrollGuard from "./NumberInputScrollGuard";
import {I18nProvider} from "./I18nProvider";
import {detectLocale,type Locale} from "@/lib/i18n";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "ISIPICI · Client & payment management",
  description: "Clients, payments and due dates in one place for small businesses and organisations.",
  metadataBase: new URL("https://www.isipici.com"),
  icons: { icon: [{ url: "/favicon.svg" },{ url: "/favicon.ico", type: "image/svg+xml" }] },
  openGraph: {
    title: "ISIPICI",
    description: "Manage clients, payments and debt with a simple dashboard built for daily operations.",
    url: "https://www.isipici.com",
    siteName: "ISIPICI",
    images: [{url:"/isipici-busqueda.png",width:1200,height:630,alt:"ISIPICI - client and payment management"}],
  },
  twitter: {
    card: "summary_large_image",
    title: "ISIPICI",
    description: "Manage clients, payments and debt with a dashboard built for daily operations.",
    images: ["/isipici-busqueda.png"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable:true,statusBarStyle:"black-translucent",title:"ISIPICI" },
};

export const viewport: Viewport = { themeColor: "#000000" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore=await cookies()
  const stored=cookieStore.get("isipici_locale")?.value
  const requestHeaders=await headers()
  const initialLocale:Locale=stored==="en"||stored==="es"?stored:detectLocale(requestHeaders.get("accept-language"))
  return (
    <html lang={initialLocale} className={plusJakarta.variable}>
      <body className="font-sans antialiased">
        <I18nProvider initialLocale={initialLocale}>
          <PWARegister />
          <NumberInputScrollGuard />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
