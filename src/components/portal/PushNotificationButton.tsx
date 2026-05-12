"use client";

import { useState, useEffect } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output.buffer as ArrayBuffer;
}

type Status = "loading" | "unsupported" | "denied" | "subscribed" | "unsubscribed";

export function PushNotificationButton() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setStatus(sub ? "subscribed" : "unsubscribed");
      });
    });
  }, []);

  async function handleSubscribe() {
    setStatus("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        toast.error("Debes permitir las notificaciones en tu navegador");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error("VAPID key not configured");

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const json = sub.toJSON();
      const res = await fetch("/api/employee/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        }),
      });

      if (!res.ok) throw new Error("Failed to save subscription");
      setStatus("subscribed");
      toast.success("¡Notificaciones activadas! Te avisaremos cuando se publique un horario.");
    } catch (err) {
      console.error(err);
      setStatus("unsubscribed");
      toast.error("No se pudieron activar las notificaciones");
    }
  }

  async function handleUnsubscribe() {
    setStatus("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await fetch("/api/employee/push-subscribe", { method: "DELETE" });
      setStatus("unsubscribed");
      toast.success("Notificaciones desactivadas");
    } catch (err) {
      console.error(err);
      setStatus("subscribed");
      toast.error("Error al desactivar notificaciones");
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-md bg-[#F2EDE6] text-[#7A6358] animate-pulse">
        <Bell className="w-4 h-4" />
        <span>Cargando...</span>
      </div>
    );
  }

  if (status === "unsupported") return null;

  if (status === "denied") {
    return (
      <div className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-md bg-[#F2EDE6] text-[#7A6358]" title="Activa los permisos en la configuración de tu navegador">
        <BellOff className="w-4 h-4" />
        <span>Notificaciones bloqueadas</span>
      </div>
    );
  }

  if (status === "subscribed") {
    return (
      <button
        onClick={handleUnsubscribe}
        className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-md bg-[#6B8E6B]/10 text-[#6B8E6B] hover:bg-[#6B8E6B]/20 transition-colors"
      >
        <BellRing className="w-4 h-4" />
        <span>Notificaciones activas</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleSubscribe}
      className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-md bg-[#C1643F]/10 text-[#C1643F] hover:bg-[#C1643F]/20 transition-colors"
    >
      <Bell className="w-4 h-4" />
      <span>Activar notificaciones</span>
    </button>
  );
}
