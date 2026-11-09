import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/shared/ThemeProvider";
import { ServiceWorkerInit } from "@/components/shared/ServiceWorkerInit";

// Fuentes autoalojadas: next/font las descarga en el build y las sirve desde /_next,
// así la CSP (font-src 'self') no tiene que abrirse a fonts.googleapis.com/gstatic.
// Antes un @import a Google en globals.css quedaba bloqueado por la CSP.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-inter", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-jakarta", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "Nómina Xpress",
  description: "Sistema de gestión de nómina para restaurantes",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`h-full ${inter.variable} ${jakarta.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#C1643F" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Nómina Xpress" />
        {/* Elimina atributos inyectados por extensiones del navegador */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var o=new MutationObserver(function(m){m.forEach(function(r){if(r.type==='attributes'&&r.attributeName.indexOf('bis_')===0){r.target.removeAttribute(r.attributeName)}})});o.observe(document.documentElement,{attributes:true,subtree:true,attributeFilter:['bis_skin_checked','bis_register']})}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <div suppressHydrationWarning>
            {children}
            <Toaster richColors position="bottom-right" />
          </div>
        </ThemeProvider>
        <ServiceWorkerInit />
      </body>
    </html>
  );
}
