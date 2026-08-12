/** Browser / OS desktop notifications for Kwick CRM alerts. */

const ICON = "/hr/kwick-k-icon.png";

export type DesktopNotifyOpts = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Prompt the user to allow system notifications. Must run from a click. */
export async function requestDesktopPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Show an OS/system notification.
 * Prefer when the tab is hidden/backgrounded; callers can force with `force`.
 */
export function showDesktopNotification(opts: DesktopNotifyOpts, force = false): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (!force && !document.hidden && document.hasFocus()) return;

  try {
    const n = new Notification(opts.title || "Kwick", {
      body: opts.body || "",
      icon: ICON,
      badge: ICON,
      tag: opts.tag || undefined,
      // Keep sound via our in-app pop; OS may also chime depending on settings.
      silent: false,
      data: { url: opts.url || "/reminders" },
    });
    n.onclick = () => {
      try {
        window.focus();
        const url = opts.url || "/reminders";
        if (url) window.location.assign(url);
      } catch {
        /* ignore */
      }
      n.close();
    };
    // Auto-close after a while so the tray doesn't fill up.
    setTimeout(() => n.close(), 12_000);
  } catch {
    /* some browsers throw if the page isn't allowed */
  }
}
