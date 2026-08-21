"use client";

import { useEffect, useRef, useState } from "react";

const EMOJI_SECTIONS: { label: string; icon: string; emojis: string[] }[] = [
  {
    label: "Smileys",
    icon: "😀",
    emojis: [
      "😀", "😁", "😂", "🤣", "😊", "😍", "🥰", "😘", "😜", "🤔",
      "😎", "🤩", "😇", "🥳", "😅", "😢", "😭", "😤", "😡", "😴",
      "🤗", "🫡", "🤝", "👍", "👎", "👏", "🙏", "🔥", "💯", "✨",
    ],
  },
  {
    label: "Gestures",
    icon: "👋",
    emojis: [
      "👋", "✋", "🤚", "🖐️", "👌", "✌️", "🤞", "🤟", "🤘", "🤙",
      "👈", "👉", "👆", "👇", "☝️", "🫵", "💪", "🫶", "❤️", "🧡",
      "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❣️", "💕", "💞",
    ],
  },
  {
    label: "Work",
    icon: "💼",
    emojis: [
      "✅", "❌", "⚠️", "📌", "📍", "📎", "📝", "📋", "📁", "📂",
      "📊", "📈", "📉", "🗓️", "⏰", "⌛", "💡", "🎯", "🚀", "⭐",
      "🏆", "🎉", "💬", "📧", "🔔", "🔕", "🛠️", "⚙️", "🔒", "🔑",
    ],
  },
  {
    label: "Objects",
    icon: "☕",
    emojis: [
      "☕", "🍵", "🍕", "🍔", "🍟", "🍰", "🎂", "🍩", "🍎", "🌴",
      "🌍", "🏠", "🚗", "✈️", "📱", "💻", "🖥️", "📷", "🎧", "🎵",
      "🎬", "🎮", "⚽", "🏀", "🎁", "🛍️", "💰", "💵", "🌈", "☀️",
    ],
  },
];

/**
 * Compact emoji panel for chat composers — curated sets, no external package.
 */
export function EmojiPicker({
  onPick,
  disabled = false,
}: {
  onPick: (emoji: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        className="icon-btn-anim"
        style={triggerBtn}
        disabled={disabled}
        aria-label="Emoji"
        title="Emoji"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <i className="bi bi-emoji-smile" style={{ fontSize: 16 }} />
      </button>
      {open && (
        <div className="emoji-picker-panel" role="dialog" aria-label="Choose emoji" style={panel}>
          <div style={tabs}>
            {EMOJI_SECTIONS.map((s, i) => (
              <button
                key={s.label}
                type="button"
                className="emoji-picker-tab"
                title={s.label}
                aria-label={s.label}
                aria-pressed={section === i}
                onClick={() => setSection(i)}
                style={{
                  ...tabBtn,
                  background: section === i ? "var(--gold-soft)" : "transparent",
                  boxShadow: section === i ? "inset 0 0 0 1px var(--gold)" : undefined,
                }}
              >
                {s.icon}
              </button>
            ))}
          </div>
          <div style={grid}>
            {EMOJI_SECTIONS[section].emojis.map((emoji) => (
              <button
                key={`${section}-${emoji}`}
                type="button"
                className="emoji-picker-item"
                onClick={() => {
                  onPick(emoji);
                  setOpen(false);
                }}
                style={emojiBtn}
                aria-label={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const triggerBtn: React.CSSProperties = {
  width: 38,
  height: 38,
  minWidth: 38,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--bg)",
  color: "var(--text-muted)",
  border: "none",
};

const panel: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 10px)",
  left: 0,
  width: 292,
  maxWidth: "min(292px, calc(100vw - 32px))",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  boxShadow: "0 10px 28px rgba(0, 0, 205, 0.14)",
  padding: 10,
  zIndex: 40,
};

const tabs: React.CSSProperties = {
  display: "flex",
  gap: 4,
  marginBottom: 8,
  paddingBottom: 8,
  borderBottom: "1px solid var(--border)",
};

const tabBtn: React.CSSProperties = {
  flex: 1,
  height: 34,
  borderRadius: 8,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, 1fr)",
  gap: 2,
  maxHeight: 220,
  overflowY: "auto",
};

const emojiBtn: React.CSSProperties = {
  height: 40,
  border: "none",
  borderRadius: 8,
  background: "transparent",
  cursor: "pointer",
  fontSize: 22,
  lineHeight: 1,
  display: "grid",
  placeItems: "center",
};
