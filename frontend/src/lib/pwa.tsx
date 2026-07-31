"use client";

import { useEffect } from "react";

import { api } from "./api";
import { useAuth } from "./auth";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

async function subscribeToPush(registration: ServiceWorkerRegistration) {
  if (!VAPID_PUBLIC_KEY || !("PushManager" in window) || !("Notification" in window)) return;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    // Only ever shows the browser's native prompt once — after that,
    // permission is either "granted" or "denied" and this is a no-op.
    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
    }
    if (Notification.permission !== "granted") return;
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = subscription.toJSON();
  await api("/api/notifications/push-subscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  }).catch(() => {});
}

// Mounted once at the root so every page (not just the (app) shell) gets an
// installable PWA, and any logged-in user gets a push subscription synced.
export function PwaRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then(subscribeToPush).catch(() => {});
  }, [user]);

  return null;
}
