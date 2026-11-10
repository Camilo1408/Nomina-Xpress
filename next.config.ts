import type { NextConfig } from "next";
import { buildCsp } from "./src/lib/csp";

// Cabeceras de seguridad aplicadas a todas las respuestas.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

// H10: las páginas reciben su Content-Security-Policy, con un nonce por petición, desde
// src/proxy.ts. Aquí va la política base, sin scripts en línea, solo para lo que el proxy
// no atiende o no es una página (API y archivos). Las dos listas no se solapan a propósito:
// así una respuesta nunca lleva dos políticas distintas.
const baseCsp = [{ key: "Content-Security-Policy", value: buildCsp() }];
const BASE_CSP_SOURCES = ["/api/:path*", "/_next/:path*", "/uploads/:path*", "/sw.js", "/manifest.json"];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  images: {
    remotePatterns: [],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...BASE_CSP_SOURCES.map((source) => ({ source, headers: baseCsp })),
    ];
  },
};

export default nextConfig;
