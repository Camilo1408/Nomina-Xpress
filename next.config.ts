import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
