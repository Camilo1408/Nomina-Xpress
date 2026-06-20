import webpush from "web-push";

// Inicialización diferida: setVapidDetails lanza si los keys están ausentes,
// y se ejecutaría al importar el módulo durante el build de Next.js
// (fase "Collecting page data") cuando las env vars aún no están disponibles.
let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return;
  webpush.setVapidDetails(
    "mailto:soporte@nominaxpress.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  vapidReady = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<boolean> {
  ensureVapid();
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload)
    );
    return true;
  } catch (err: unknown) {
    // 410 Gone = subscription expired/invalid, caller should delete it
    console.error("Push failed:", (err as { statusCode?: number })?.statusCode ?? err);
    return false;
  }
}
