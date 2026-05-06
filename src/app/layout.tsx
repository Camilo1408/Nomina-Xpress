import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/shared/ThemeProvider";

export const metadata: Metadata = {
  title: "Nómina Xpress",
  description: "Sistema de gestión de nómina para restaurantes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full" suppressHydrationWarning>
      <head>
        {/* Elimina atributos inyectados por extensiones del navegador (bis_skin_checked, etc.)
            antes de que React hidrate, evitando el error de hydration mismatch. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var o=new MutationObserver(function(m){m.forEach(function(r){if(r.type==='attributes'&&r.attributeName.indexOf('bis_')===0){r.target.removeAttribute(r.attributeName)}})});o.observe(document.documentElement,{attributes:true,subtree:true,attributeFilter:['bis_skin_checked','bis_register']})}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <div suppressHydrationWarning>
            {children}
            <Toaster richColors position="top-right" />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
