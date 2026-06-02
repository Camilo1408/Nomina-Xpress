"use client";

import { useEffect } from "react";

export function ServiceWorkerInit() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.error("SW registration failed:", err));
    }
  }, []);

  return null;
}
