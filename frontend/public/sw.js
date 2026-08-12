// Minimal PWA service worker — installability + Web Push only.
// Deliberately does NOT cache/proxy app requests: this app is actively
// developed and redeployed often, and a caching SW risks serving stale JS
// chunks after a rebuild. Push notifications need a SW registered at all,
// even with an empty fetch strategy, so this stays intentionally thin.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Mirrors frontend/src/lib/notifications.ts SOURCE_META hrefs — service
// workers can't import app TS modules, so this small map is duplicated here.
const SOURCE_HREF = {
  renewal: "/renewals",
  calendar: "/calendar",
  task: "/tasks",
  leave_request: "/hr",
  ticket: "/hr",
  document: "/profile",
  staff_renewal: "/hr",
  chat: "/chat",
};

const ICON = "/hr/kwick-k-icon.png";

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const title = payload.title || "Kwick";
  let url = SOURCE_HREF[payload.source] || "/reminders";
  if (payload.kind === "chat_message" && payload.conversation_id) {
    url = `/chat?conversation=${payload.conversation_id}`;
  } else if (payload.url) {
    url = payload.url;
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || payload.preview || "",
      icon: ICON,
      badge: ICON,
      tag: payload.id
        ? `kwick-${payload.id}`
        : payload.kind === "chat_message"
          ? `chat-${payload.conversation_id}`
          : undefined,
      data: { url },
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin && "focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
