"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { api, refreshSession, unwrapList, wsUrl } from "./api";
import { useAuth } from "./auth";
import { notificationHref } from "./notifications";
import { showDesktopNotification } from "./systemNotify";
import { useToast } from "./toast";

type LiveUpdatesContextValue = {
  notifUnread: number;
  chatUnread: number;
  refreshCounts: () => void;
};

const LiveUpdatesContext = createContext<LiveUpdatesContextValue>({
  notifUnread: 0,
  chatUnread: 0,
  refreshCounts: () => {},
});

export function useLiveUpdates() {
  return useContext(LiveUpdatesContext);
}

type ChatEvent = { kind: "chat_message"; conversation_id: number; sender_name: string; preview: string };
type NotificationEventPush = {
  id: number;
  source: string;
  title: string;
  body: string;
  object_ref?: string;
  created_at: string;
};

// Synthesized two-note "pop" via the Web Audio API instead of bundling an
// audio asset. AudioContext starts suspended until a user gesture; by the
// time a WS message can arrive the user has already logged in (a gesture),
// so resume() here is just a safety net for browsers that need it re-armed.
function playPop() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx: AudioContext = new Ctx();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      const start = now + i * 0.09;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.start(start);
      osc.stop(start + 0.2);
    });
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Autoplay-policy or unsupported-browser edge cases — a missed sound
    // isn't worth surfacing an error over.
  }
}

export function LiveUpdatesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const [notifUnread, setNotifUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);

  const refreshCounts = () => {
    api<{ read_at: string | null }[]>("/api/notifications")
      .then((items) => setNotifUnread(items.filter((n) => !n.read_at).length))
      .catch(() => {});
    api<{ unread_count: number }[] | { results: { unread_count: number }[] }>(
      "/api/messages/conversations?page_size=200"
    )
      .then((d) => setChatUnread(unwrapList(d).reduce((sum, c) => sum + (c.unread_count || 0), 0)))
      .catch(() => {});
  };

  // Re-sync on every navigation too — visiting Reminders/Chat marks things
  // read server-side, and this is the simplest way to reflect that in the
  // badges without every page having to remember to call refreshCounts().
  useEffect(() => {
    if (!user) return;
    refreshCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, pathname]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const handleMessage = (e: MessageEvent) => {
      let payload: ChatEvent | NotificationEventPush;
      try {
        payload = JSON.parse(e.data);
      } catch {
        return;
      }
      if ("kind" in payload && payload.kind === "chat_message") {
        setChatUnread((n) => n + 1);
        const chatUrl = `/chat?conversation=${payload.conversation_id}`;
        showToast(`${payload.sender_name}: ${payload.preview}`, "info", () => router.push(chatUrl));
        playPop();
        showDesktopNotification({
          title: payload.sender_name || "New message",
          body: payload.preview || "New chat message",
          url: chatUrl,
          tag: `chat-${payload.conversation_id}`,
        });
      } else if ("title" in payload) {
        setNotifUnread((n) => n + 1);
        const href = notificationHref(payload.source, payload.object_ref);
        showToast(payload.title, "info", () => router.push(href));
        playPop();
        showDesktopNotification({
          title: payload.title,
          body: payload.body || "",
          url: href,
          tag: payload.id ? `kwick-${payload.id}` : `kwick-${payload.source}`,
        });
      }
    };

    const connect = () => {
      if (cancelled) return;
      const socket = new WebSocket(wsUrl("/ws/notifications/"));
      socket.onmessage = handleMessage;
      socket.onopen = () => {
        attempt = 0;
      };
      socket.onclose = () => {
        if (cancelled) return;
        attempt += 1;
        const delay = Math.min(15_000, 800 * 2 ** Math.min(attempt, 4));
        reconnectTimer = setTimeout(() => {
          void refreshSession().finally(() => {
            if (!cancelled) connect();
          });
        }, delay);
      };
      socketRef.current = socket;
    };

    void connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <LiveUpdatesContext.Provider value={{ notifUnread, chatUnread, refreshCounts }}>
      {children}
    </LiveUpdatesContext.Provider>
  );
}
