"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { API_BASE } from "@/lib/api";

type PostFile = { index: number; name: string; kind: "image" | "video" | "file" };
type Item = {
  id: number;
  title: string;
  content_type: string;
  description: string;
  scheduled_date: string;
  post_files: PostFile[];
  post_caption: string;
  comment_count: number;
};
type Calendar = {
  client: { name: string; accent_color: string };
  expires_at: string | null;
  items: Item[];
};
type Comment = { id: number; from_client: boolean; author_name: string; body: string; created_at: string };

const TYPE_META: Record<string, { label: string; icon: string }> = {
  static_post: { label: "Static Post", icon: "bi-image" },
  reel: { label: "Reel", icon: "bi-camera-reels" },
  story: { label: "Story", icon: "bi-circle-square" },
  video: { label: "Video", icon: "bi-play-btn" },
  carousel: { label: "Carousel", icon: "bi-collection" },
  other: { label: "Other", icon: "bi-stars" },
};
const typeMeta = (t: string) => TYPE_META[t] ?? TYPE_META.other;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const GREEN = "#16a34a";

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseIso(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
function safeColor(c: string) {
  return /^#[0-9a-fA-F]{6}$/.test(c || "") ? c : "#3673FC";
}
function fmtDay(v: string, opts: Intl.DateTimeFormatOptions) {
  const d = parseIso(v);
  return d ? d.toLocaleDateString(undefined, opts) : v;
}

export default function ClientViewPage() {
  const token = String(useParams().token ?? "");
  const base = `${API_BASE}/api/public/calendar/${encodeURIComponent(token)}`;

  const [data, setData] = useState<Calendar | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => iso(new Date()));
  const [openId, setOpenId] = useState<number | null>(null);

  const load = () =>
    fetch(base, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("unavailable");
        const json = await res.json();
        if (!json || !Array.isArray(json.items) || !json.client) throw new Error("bad");
        setData(json);
        setState("ready");
      })
      .catch(() => setState((s) => (s === "ready" ? s : "unavailable")));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const items = useMemo(() => (data?.items ?? []).filter((i) => parseIso(i.scheduled_date)), [data]);
  const accent = safeColor(data?.client.accent_color || "");

  const byDate = useMemo(() => {
    const map: Record<string, Item[]> = {};
    for (const it of items) (map[it.scheduled_date] ||= []).push(it);
    return map;
  }, [items]);

  if (state === "loading") {
    return (
      <div style={center}>
        <span style={{ color: MUTED }}>Loading calendar…</span>
      </div>
    );
  }
  if (state === "unavailable" || !data) {
    return (
      <div style={center}>
        <div style={{ textAlign: "center", maxWidth: 380, padding: 24 }}>
          <i className="bi bi-link-45deg" style={{ fontSize: 40, color: "#9ca3af" }} />
          <h1 style={{ fontSize: 20, margin: "8px 0", color: INK }}>This link isn&apos;t available</h1>
          <p style={{ color: MUTED, fontSize: 14, margin: 0 }}>
            It may have expired or been turned off. Please ask your account manager for a new link.
          </p>
        </div>
      </div>
    );
  }

  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const todayIso = iso(new Date());
  const dayItems = byDate[selected] ?? [];
  const monthItems = items.filter((i) => i.scheduled_date.startsWith(monthPrefix));
  const readyCount = monthItems.filter((i) => i.post_files.length > 0).length;
  const initial = (data.client.name || "?").trim().charAt(0).toUpperCase();

  const goto = (d: Date) => {
    setAnchor(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelected(iso(d));
  };

  return (
    <div style={page}>
      <style>{css(accent)}</style>

      <header style={{ background: `linear-gradient(135deg, ${accent}, ${accent}b3)`, color: "#fff" }}>
        <div className="cv-wrap" style={{ display: "flex", alignItems: "center", gap: 16, padding: "28px 16px" }}>
          <span style={avatar}>{initial}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, letterSpacing: 1.2, opacity: 0.85, fontWeight: 600 }}>CONTENT CALENDAR</div>
            <h1 style={{ margin: "2px 0 0", fontSize: 26, lineHeight: 1.2, color: "#fff", fontWeight: 700 }}>
              {data.client.name}
            </h1>
          </div>
        </div>
      </header>

      <main className="cv-wrap" style={{ padding: 16, flex: 1, width: "100%" }}>
        <div className="cv-stats">
          <Stat label={`${MONTHS[month]} posts`} value={monthItems.length} icon="bi-calendar3" color={accent} />
          <Stat label="Posts ready" value={readyCount} icon="bi-check-circle-fill" color={GREEN} />
          <Stat label="Still planned" value={monthItems.length - readyCount} icon="bi-hourglass-split" color="#d97706" />
        </div>

        <div className="cv-grid">
          <section style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <button type="button" className="cv-nav" onClick={() => setAnchor(new Date(year, month - 1, 1))} aria-label="Previous month">
                <i className="bi bi-chevron-left" />
              </button>
              <strong style={{ flex: 1, textAlign: "center", fontSize: 17, color: INK }}>
                {MONTHS[month]} {year}
              </strong>
              <button type="button" className="cv-today" onClick={() => goto(new Date())}>
                Today
              </button>
              <button type="button" className="cv-nav" onClick={() => setAnchor(new Date(year, month + 1, 1))} aria-label="Next month">
                <i className="bi bi-chevron-right" />
              </button>
            </div>

            <div className="cv-days">
              {WEEKDAYS.map((w) => (
                <div key={w} className="cv-wd">{w}</div>
              ))}
              {cells.map((day, i) => {
                if (day === null) return <div key={`b${i}`} />;
                const key = `${monthPrefix}-${String(day).padStart(2, "0")}`;
                const list = byDate[key] ?? [];
                const isSel = key === selected;
                const isToday = key === todayIso;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`cv-day${isSel ? " sel" : ""}${isToday ? " today" : ""}${list.length ? " has" : ""}`}
                    onClick={() => setSelected(key)}
                  >
                    <span className="cv-num">{day}</span>
                    <span className="cv-chips">
                      {list.slice(0, 2).map((it) => (
                        <span key={it.id} className="cv-chip" style={{ background: it.post_files.length ? GREEN : accent }}>
                          {it.title}
                        </span>
                      ))}
                      {list.length > 2 && <span className="cv-more">+{list.length - 2} more</span>}
                    </span>
                    <span className="cv-dots">
                      {list.slice(0, 4).map((it) => (
                        <span key={it.id} className="cv-dot" style={{ background: it.post_files.length ? GREEN : accent }} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 12, color: MUTED }}>
              <span><span style={{ ...legendDot, background: accent }} />Planned</span>
              <span><span style={{ ...legendDot, background: GREEN }} />Post ready</span>
            </div>
          </section>

          <section style={card}>
            <h2 style={dayTitle}>
              {fmtDay(selected, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </h2>
            {dayItems.length === 0 ? (
              <div style={{ textAlign: "center", padding: "22px 0", color: MUTED }}>
                <i className="bi bi-calendar2-check" style={{ fontSize: 28, color: "#cbd5e1" }} />
                <p style={{ margin: "6px 0 0", fontSize: 14 }}>Nothing scheduled for this day.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {dayItems.map((it) => (
                  <ItemCard
                    key={it.id}
                    item={it}
                    base={base}
                    accent={accent}
                    open={openId === it.id}
                    onToggle={() => setOpenId(openId === it.id ? null : it.id)}
                    onCommented={load}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <section style={{ ...card, marginTop: 16 }}>
          <h2 style={dayTitle}>{MONTHS[month]} at a glance</h2>
          {monthItems.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 14, margin: 0 }}>No content scheduled this month.</p>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {monthItems.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="cv-row"
                  onClick={() => {
                    setSelected(it.scheduled_date);
                    setOpenId(it.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <span className="cv-row-date" style={{ color: accent }}>
                    {fmtDay(it.scheduled_date, { day: "numeric", month: "short" })}
                  </span>
                  <i className={`bi ${typeMeta(it.content_type).icon}`} style={{ color: MUTED }} />
                  <span style={{ flex: 1, textAlign: "left", color: INK, fontWeight: 600, minWidth: 0 }}>{it.title}</span>
                  <span className="cv-row-type">{typeMeta(it.content_type).label}</span>
                  {it.post_files.length > 0 ? (
                    <span style={{ ...pill, background: "#dcfce7", color: "#166534" }}>Ready</span>
                  ) : (
                    <span style={{ ...pill, background: "#f3f4f6", color: MUTED }}>Planned</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer style={{ textAlign: "center", padding: "20px 16px 28px", fontSize: 13, color: MUTED }}>
        Powered By <strong style={{ color: INK }}>Kreativefolio</strong>
      </footer>
    </div>
  );
}

function Stat({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, padding: 14 }}>
      <span style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", background: `${color}1f`, color, fontSize: 18 }}>
        <i className={`bi ${icon}`} />
      </span>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: INK, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{label}</div>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  base,
  accent,
  open,
  onToggle,
  onCommented,
}: {
  item: Item;
  base: string;
  accent: string;
  open: boolean;
  onToggle: () => void;
  onCommented: () => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [brokenFiles, setBrokenFiles] = useState<Record<number, boolean>>({});
  const ready = item.post_files.length > 0;
  const meta = typeMeta(item.content_type);

  useEffect(() => {
    try {
      setName(localStorage.getItem("kwick-client-name") || "");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open || comments !== null) return;
    fetch(`${base}/items/${item.id}/comments`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((c) => setComments(Array.isArray(c) ? c : []))
      .catch(() => setComments([]));
  }, [open, comments, base, item.id]);

  const send = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`${base}/items/${item.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, body }),
      });
      if (res.status === 429) throw new Error("You're commenting too fast — please wait a minute.");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d?.detail === "string" ? d.detail : "Couldn't send your comment.");
      }
      const list = await res.json();
      setComments(Array.isArray(list) ? list : []);
      setBody("");
      try {
        localStorage.setItem("kwick-client-name", name);
      } catch {
        /* ignore */
      }
      onCommented();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your comment.");
    } finally {
      setSending(false);
    }
  };

  const fileUrl = (f: PostFile, download = false) =>
    `${base}/items/${item.id}/files/${f.index}${download ? "?download=1" : ""}`;

  return (
    <div style={{ border: `1px solid ${open ? accent : LINE}`, borderRadius: 14, overflow: "hidden", background: "#fff" }}>
      <button type="button" onClick={onToggle} className="cv-card-head" aria-expanded={open}>
        <span style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", background: `${accent}1a`, color: accent, fontSize: 17, flexShrink: 0 }}>
          <i className={`bi ${meta.icon}`} />
        </span>
        <span style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 650, fontSize: 14.5, color: INK }}>{item.title}</span>
          <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 2 }}>
            {meta.label}
            {item.comment_count > 0 && (
              <span style={{ marginLeft: 8 }}>
                <i className="bi bi-chat-dots" /> {item.comment_count}
              </span>
            )}
          </span>
        </span>
        <span style={{ ...pill, background: ready ? "#dcfce7" : "#f3f4f6", color: ready ? "#166534" : MUTED }}>
          {ready ? "Post ready" : "Planned"}
        </span>
        <i className={`bi ${open ? "bi-chevron-up" : "bi-chevron-down"}`} style={{ color: MUTED }} />
      </button>

      {open && (
        <div style={{ padding: "0 14px 14px", display: "grid", gap: 12 }}>
          {item.description && (
            <p style={{ margin: 0, fontSize: 14, color: "#374151", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {item.description}
            </p>
          )}

          {ready && (
            <div style={{ display: "grid", gap: 10 }}>
              {item.post_files.map((f) =>
                brokenFiles[f.index] ? (
                  <div key={f.index} style={fileFallback}>This file couldn&apos;t be loaded.</div>
                ) : f.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={f.index}
                    src={fileUrl(f)}
                    alt={f.name}
                    style={{ width: "100%", borderRadius: 10, background: "#f3f4f6" }}
                    onError={() => setBrokenFiles((b) => ({ ...b, [f.index]: true }))}
                  />
                ) : f.kind === "video" ? (
                  <video
                    key={f.index}
                    src={fileUrl(f)}
                    controls
                    preload="metadata"
                    playsInline
                    style={{ width: "100%", borderRadius: 10, background: "#000" }}
                    onError={() => setBrokenFiles((b) => ({ ...b, [f.index]: true }))}
                  />
                ) : (
                  <a key={f.index} href={fileUrl(f)} target="_blank" rel="noopener noreferrer" style={{ ...fileFallback, color: accent, textDecoration: "none" }}>
                    <i className="bi bi-file-earmark-text" /> {f.name}
                  </a>
                )
              )}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {item.post_files.map((f) => (
                  <a key={f.index} href={fileUrl(f, true)} style={{ color: accent, fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>
                    <i className="bi bi-download" /> Download{item.post_files.length > 1 ? ` ${f.name}` : ""}
                  </a>
                ))}
              </div>
              {item.post_caption && (
                <div style={{ background: "#f9fafb", border: `1px solid ${LINE}`, borderRadius: 10, padding: 12, fontSize: 13.5, color: "#374151", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 0.6, marginBottom: 4 }}>CAPTION</div>
                  {item.post_caption}
                </div>
              )}
            </div>
          )}

          <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 0.6, marginBottom: 8 }}>COMMENTS</div>
            {comments === null ? (
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>Loading…</div>
            ) : comments.length === 0 ? (
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>No comments yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                {comments.map((c) => (
                  <div key={c.id} style={{ background: c.from_client ? "#f9fafb" : `${accent}12`, borderRadius: 10, padding: "8px 10px", fontSize: 13.5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <strong style={{ color: INK }}>{c.author_name}</strong>
                      {!c.from_client && <span style={{ ...pill, background: "#e0e7ff", color: "#3730a3", padding: "1px 6px", fontSize: 10 }}>Team</span>}
                      <span style={{ color: "#9ca3af", fontSize: 11 }}>{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", color: "#374151", marginTop: 2 }}>{c.body}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gap: 8 }}>
              <input className="cv-input" placeholder="Your name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
              <textarea className="cv-input" style={{ resize: "vertical" }} rows={2} placeholder="Leave a comment…" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} />
              {error && <span style={{ color: "#dc2626", fontSize: 12.5 }}>{error}</span>}
              <button type="button" onClick={send} disabled={sending || !body.trim()} className="cv-send" style={{ background: accent }}>
                {sending ? "Sending…" : "Send comment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const css = (accent: string) => `
  .cv-wrap { max-width: 1080px; margin: 0 auto; }
  .cv-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
  .cv-grid { display: grid; gap: 16px; grid-template-columns: 1fr; align-items: start; }
  @media (min-width: 900px) { .cv-grid { grid-template-columns: 1.35fr 1fr; } }
  @media (max-width: 520px) { .cv-stats { grid-template-columns: 1fr; } }
  .cv-nav { width: 34px; height: 34px; border-radius: 50%; border: 1px solid ${LINE}; background: #fff; color: ${INK}; cursor: pointer; display: grid; place-items: center; }
  .cv-nav:hover { background: #f3f4f6; }
  .cv-today { border: 1px solid ${LINE}; background: #fff; color: ${INK}; border-radius: 999px; padding: 6px 12px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .cv-today:hover { background: #f3f4f6; }
  .cv-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; }
  .cv-wd { text-align: center; font-size: 11px; font-weight: 600; color: ${MUTED}; padding: 4px 0; text-transform: uppercase; letter-spacing: .5px; }
  .cv-day { min-height: 78px; border: 1px solid ${LINE}; border-radius: 10px; background: #fff; display: flex; flex-direction: column; align-items: stretch; gap: 4px; padding: 5px; cursor: pointer; text-align: left; color: ${INK}; transition: border-color .12s, box-shadow .12s, background .12s; }
  .cv-day:hover { border-color: ${accent}; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
  .cv-day.has { background: ${accent}0d; }
  .cv-day.sel { border-color: ${accent}; background: ${accent}1a; box-shadow: 0 0 0 2px ${accent}40; }
  .cv-num { font-size: 12.5px; font-weight: 700; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; color: ${INK}; }
  .cv-day.today .cv-num { background: ${accent}; color: #fff; }
  .cv-chips { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .cv-chip { font-size: 10.5px; line-height: 1.25; color: #fff; border-radius: 4px; padding: 1px 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
  .cv-more { font-size: 10px; color: ${MUTED}; padding-left: 2px; }
  .cv-dots { display: none; gap: 3px; flex-wrap: wrap; justify-content: center; }
  .cv-dot { width: 7px; height: 7px; border-radius: 50%; }
  @media (max-width: 640px) {
    .cv-day { min-height: 48px; align-items: center; }
    .cv-chips { display: none; }
    .cv-dots { display: flex; }
  }
  .cv-card-head { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 14px; background: none; border: none; cursor: pointer; }
  .cv-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid ${LINE}; border-radius: 10px; background: #fff; cursor: pointer; font-size: 13.5px; transition: background .12s, border-color .12s; }
  .cv-row:hover { background: #f9fafb; border-color: ${accent}80; }
  .cv-row-date { font-weight: 700; min-width: 58px; text-align: left; }
  .cv-row-type { color: ${MUTED}; font-size: 12px; }
  @media (max-width: 520px) { .cv-row-type { display: none; } }
  .cv-input { width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 14px; font-family: inherit; background: #fff; color: ${INK}; }
  .cv-input:focus { outline: 2px solid ${accent}55; border-color: ${accent}; }
  .cv-send { border: none; color: #fff; padding: 10px 14px; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 14px; }
  .cv-send:disabled { opacity: .55; cursor: not-allowed; }
`;

const page: React.CSSProperties = { minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f3f4f6", color: INK };
const center: React.CSSProperties = { minHeight: "100vh", display: "grid", placeItems: "center", background: "#f3f4f6" };
const card: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,.07)", border: "1px solid #eef0f3" };
const avatar: React.CSSProperties = { width: 52, height: 52, borderRadius: 14, background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.35)", display: "grid", placeItems: "center", fontSize: 24, fontWeight: 700, flexShrink: 0 };
const dayTitle: React.CSSProperties = { fontSize: 15, margin: "0 0 12px", color: INK, fontWeight: 700 };
const legendDot: React.CSSProperties = { display: "inline-block", width: 9, height: 9, borderRadius: "50%", marginRight: 5 };
const pill: React.CSSProperties = { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap", flexShrink: 0 };
const fileFallback: React.CSSProperties = { display: "block", padding: 12, borderRadius: 10, background: "#f3f4f6", fontSize: 13, color: MUTED };
