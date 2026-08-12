"use client";

import { useEffect, useState } from "react";

import { api } from "./api";
import { useAuth } from "./auth";
import { notificationPermission, requestDesktopPermission } from "./systemNotify";

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
  if (!VAPID_PUBLIC_KEY || !("PushManager" in window) || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
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
  return true;
}

/** Ask permission (from a click), then register push subscription. */
export async function enableDesktopNotifications(): Promise<"granted" | "denied" | "unsupported"> {
  const perm = await requestDesktopPermission();
  if (perm !== "granted") return perm === "unsupported" ? "unsupported" : "denied";
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return "granted";
  try {
    const reg = await navigator.serviceWorker.ready;
    await subscribeToPush(reg);
  } catch {
    /* permission alone still enables in-tab system Notification API */
  }
  return "granted";
}

// Mounted once at the root so every page gets an installable PWA, and any
// logged-in user with permission gets a push subscription synced.
export function PwaRegistrar() {
  const { user } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (notificationPermission() !== "granted") return;
    navigator.serviceWorker.ready.then(subscribeToPush).catch(() => {});
  }, [user]);

  return null;
}

/** Soft banner + Topbar control shared state for “Allow notifications”. */
export function useNotificationPermissionState() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setPerm(notificationPermission());
    const onChange = () => setPerm(notificationPermission());
    // Some browsers fire this when the user changes site settings.
    if (typeof navigator !== "undefined" && "permissions" in navigator) {
      navigator.permissions
        .query({ name: "notifications" as PermissionName })
        .then((status) => {
          status.onchange = onChange;
        })
        .catch(() => {});
    }
  }, []);

  const enable = async () => {
    const result = await enableDesktopNotifications();
    setPerm(result === "unsupported" ? "unsupported" : result);
    return result;
  };

  return { perm, enable, needsPrompt: perm === "default" };
}
