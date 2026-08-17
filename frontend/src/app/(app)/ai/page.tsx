"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { EdithOrb } from "@/components/EdithOrb";
import { EdithPlexus } from "@/components/EdithPlexus";
import { EdithVisualCards, type EdithCards } from "@/components/EdithVisualCards";
import { Logo } from "@/components/Logo";
import { api, ApiError, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSpeechToText } from "@/lib/useSpeechToText";
import { useEdithSpeech } from "@/lib/useEdithSpeech";
import { useToast } from "@/lib/toast";
import { useShellFillHeight } from "@/lib/useShellFillHeight";

type LinkItem = { label: string; href: string; icon?: string };
type Attachment = { mime?: string; url: string; type?: string; name?: string };
type ChatMsg = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  links?: LinkItem[];
  cards?: EdithCards;
  attachments?: Attachment[];
};
type ConversationSummary = {
  id: number;
  title: string;
  preview: string;
  updated_at: string;
};

const MODULE_CARDS = [
  { label: "Tasks", href: "/tasks", icon: "bi-check-square-fill", hint: "Open work" },
  { label: "Projects", href: "/projects", icon: "bi-kanban-fill", hint: "Active work" },
  { label: "Calendar", href: "/calendar", icon: "bi-calendar3-fill", hint: "Schedule" },
  { label: "Sales", href: "/sales/invoices", icon: "bi-briefcase-fill", hint: "Invoices" },
  { label: "HR", href: "/hr/staff", icon: "bi-people-fill", hint: "Team & leave" },
  { label: "Support", href: "/support", icon: "bi-headset", hint: "Get help" },
];

function toTitleCase(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/\b([a-z0-9])([a-z0-9']*)/g, (_, a: string, b: string) => a.toUpperCase() + b);
}

async function compressImage(file: File): Promise<Attachment> {
  const bitmap = await createImageBitmap(file);
  const max = 1280;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.72);
  return { mime: "image/jpeg", url };
}

export default function EdithPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  useShellFillHeight(rootRef);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [pendingImages, setPendingImages] = useState<Attachment[]>([]);
  const [interimVoice, setInterimVoice] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const baseInputRef = useRef("");
  const empty = messages.length === 0;
  const motionOff = !!reduceMotion;
  const firstName = user?.full_name?.split(" ")[0] || "there";

  const speech = useSpeechToText((chunk, isFinal) => {
    if (isFinal) {
      const base = baseInputRef.current;
      const joined = `${base}${base && !base.endsWith(" ") ? " " : ""}${chunk.trim()}`.trimStart();
      baseInputRef.current = joined.endsWith(" ") ? joined : `${joined} `;
      setInput(baseInputRef.current);
      setInterimVoice("");
      return;
    }
    setInterimVoice(chunk);
  });
  const tts = useEdithSpeech();

  useEffect(() => {
    if (!speech.error) return;
    showToast(speech.error, "error");
    speech.clearError();
  }, [speech.error, speech.clearError, showToast]);

  const loadHistory = useCallback(async () => {
    try {
      const rows = await api<ConversationSummary[]>("/api/ai/conversations");
      setHistory(rows);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    api<{ enabled: boolean }>("/api/ai/status")
      .then((s) => setEnabled(s.enabled !== false))
      .catch(() => setEnabled(false));
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages, busy, reduceMotion]);

  const startNewChat = () => {
    speech.stop();
    tts.stop();
    setInterimVoice("");
    setConversationId(null);
    setMessages([]);
    setInput("");
    baseInputRef.current = "";
    setPendingImages([]);
    setHistoryOpen(false);
    inputRef.current?.focus();
  };

  const openConversation = async (id: number) => {
    try {
      tts.stop();
      const detail = await api<{
        id: number;
        messages: {
          id: number;
          role: "user" | "assistant";
          content: string;
          links?: LinkItem[];
          cards?: EdithCards;
          attachments?: Attachment[];
        }[];
      }>(`/api/ai/conversations/${id}`);
      setConversationId(detail.id);
      setMessages(
        detail.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          links: m.links,
          cards: m.cards,
          attachments: m.attachments,
        }))
      );
      setPendingImages([]);
      setHistoryOpen(false);
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't open chat.", "error");
    }
  };

  const deleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api(`/api/ai/conversations/${id}`, { method: "DELETE" });
      if (conversationId === id) startNewChat();
      await loadHistory();
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't delete.", "error");
    }
  };

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...pendingImages];
    for (const file of Array.from(files)) {
      if (next.length >= 3) break;
      if (!file.type.startsWith("image/")) {
        showToast("Only image files are supported.", "error");
        continue;
      }
      try {
        next.push(await compressImage(file));
      } catch {
        showToast("Couldn't process that image.", "error");
      }
    }
    setPendingImages(next.slice(0, 3));
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async (text: string) => {
    const content = text.trim();
    const images = pendingImages;
    if ((!content && images.length === 0) || busy) return;
    speech.stop();
    tts.stop();
    setInterimVoice("");
    setMessages((prev) => [...prev, { role: "user", content, attachments: images }]);
    setInput("");
    baseInputRef.current = "";
    setPendingImages([]);
    setBusy(true);
    try {
      const res = await api<{
        conversation_id: number;
        title: string;
        reply: string;
        links?: LinkItem[];
        cards?: EdithCards;
        messages: {
          id: number;
          role: "user" | "assistant";
          content: string;
          links?: LinkItem[];
          cards?: EdithCards;
          attachments?: Attachment[];
        }[];
      }>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          message: content,
          conversation_id: conversationId,
          images,
        }),
      });
      setConversationId(res.conversation_id);
      setMessages(
        res.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          links: m.links,
          cards: m.cards,
          attachments: m.attachments,
        }))
      );
      if (res.reply) tts.speak(res.reply);
      await loadHistory();
    } catch (err) {
      const msg = err instanceof ApiError ? formatApiError(err.data) : "Request failed.";
      showToast(msg, "error");
      const fallback = `Sorry — I couldn't answer (${msg}).`;
      setMessages((prev) => [...prev, { role: "assistant", content: fallback }]);
      tts.speak(fallback);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const copyReply = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied", "success");
    } catch {
      showToast("Couldn't copy", "error");
    }
  };

  const activeTitle =
    history.find((c) => c.id === conversationId)?.title ||
    (messages[0]?.content ? toTitleCase(messages[0].content.slice(0, 48)) : "New Chat");

  return (
    <div className="edith-ai" ref={rootRef}>
      <EdithPlexus mode={empty ? "hero" : "ambient"} className="edith-ai__plexus" paused={motionOff} />
      <div className="edith-ai__glow edith-ai__glow--a" aria-hidden />
      <div className="edith-ai__glow edith-ai__glow--b" aria-hidden />

      <div className={`edith-ai__layout ${historyOpen ? "is-open" : ""}`}>
        {historyOpen && (
          <aside className="edith-ai__sidebar is-open">
            <div className="edith-ai__sidebar-head">
              <p className="edith-ai__sidebar-heading">Chat history</p>
              <button
                type="button"
                className="edith-ai__icon-btn"
                aria-label="Close history"
                onClick={() => setHistoryOpen(false)}
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>
            <div className="edith-ai__history-list">
              {history.length === 0 && (
                <p className="edith-ai__history-empty">No chats yet. Start a new one.</p>
              )}
              {history.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`edith-ai__history-item ${conversationId === c.id ? "is-active" : ""}`}
                  onClick={() => void openConversation(c.id)}
                >
                  <span className="edith-ai__history-title">
                    {toTitleCase(c.title || "New Chat")}
                  </span>
                  <span className="edith-ai__history-meta">
                    {formatRelative(c.updated_at)}
                    <button
                      type="button"
                      className="edith-ai__history-del"
                      aria-label="Delete chat"
                      onClick={(e) => void deleteConversation(c.id, e)}
                    >
                      <i className="bi bi-trash3" />
                    </button>
                  </span>
                </button>
              ))}
            </div>
            <p className="edith-ai__retention">Chats older than 15 days are removed automatically.</p>
          </aside>
        )}

        <div className="edith-ai__main">
          <div className={`edith-ai__toolbar ${empty ? "is-empty" : "is-chat"}`}>
            <div className="edith-ai__toolbar-left">
              <button
                type="button"
                className="edith-ai__logo-btn"
                onClick={() => setHistoryOpen((v) => !v)}
                aria-label={historyOpen ? "Close history" : "Open chat history"}
                title={historyOpen ? "Close history" : "Chat history"}
              >
                <Logo icon height={32} />
              </button>
              {!empty && (
                <div className="edith-ai__brand">
                  <span className="edith-ai__brand-mark" aria-hidden>
                    <EdithOrb size="xs" />
                  </span>
                  <div className="edith-ai__brand-text">
                    <strong>EDITH</strong>
                    <small>{toTitleCase(activeTitle)}</small>
                  </div>
                </div>
              )}
            </div>
            <div className="edith-ai__toolbar-actions">
              {tts.supported && (
                <>
                  <button
                    type="button"
                    className={`edith-ai__ghost-btn edith-ai__voice-toggle${tts.enabled ? " is-on" : ""}`}
                    onClick={() => {
                      const next = !tts.enabled;
                      tts.setEnabled(next);
                      showToast(next ? "EDITH voice replies on" : "EDITH voice replies off", "info");
                    }}
                    aria-pressed={tts.enabled}
                    title={tts.enabled ? "Turn off voice replies" : "Turn on voice replies"}
                  >
                    <i className={`bi ${tts.enabled ? "bi-volume-up-fill" : "bi-volume-mute"}`} />
                    <span className="edith-ai__voice-label">{tts.enabled ? "Voice on" : "Voice off"}</span>
                  </button>
                  {tts.speaking && (
                    <>
                      <button
                        type="button"
                        className="edith-ai__ghost-btn"
                        onClick={() => (tts.paused ? tts.resume() : tts.pause())}
                        title={tts.paused ? "Resume voice" : "Pause voice"}
                        aria-label={tts.paused ? "Resume voice" : "Pause voice"}
                      >
                        <i className={`bi ${tts.paused ? "bi-play-fill" : "bi-pause-fill"}`} />
                        <span className="edith-ai__voice-label">{tts.paused ? "Resume" : "Pause"}</span>
                      </button>
                      <button
                        type="button"
                        className="edith-ai__ghost-btn"
                        onClick={() => tts.stop()}
                        title="Stop voice"
                        aria-label="Stop voice"
                      >
                        <i className="bi bi-stop-fill" />
                        <span className="edith-ai__voice-label">Stop</span>
                      </button>
                    </>
                  )}
                </>
              )}
              <button type="button" className="edith-ai__ghost-btn" onClick={startNewChat}>
                <i className="bi bi-plus-lg" /> New Chat
              </button>
            </div>
          </div>

          <div className="edith-ai__column">
          <div className={`edith-ai__stage ${empty ? "is-empty" : "is-chat"}`}>
            <AnimatePresence mode="wait">
              {empty ? (
                <motion.div
                  key="empty"
                  className="edith-ai__hero"
                  initial={motionOff ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={motionOff ? undefined : { opacity: 0, y: -12 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  <motion.div
                    className="edith-ai__orb"
                    animate={
                      motionOff ? undefined : { y: [0, -10, 0] }
                    }
                    transition={
                      motionOff
                        ? undefined
                        : { duration: 4.2, repeat: Infinity, ease: "easeInOut" }
                    }
                  >
                    <EdithOrb size="lg" paused={motionOff} />
                  </motion.div>

                  <h2>Hello, {firstName}.</h2>
                  <p className="edith-ai__tagline">
                    How Can <em>EDITH</em> Help You Today?
                  </p>

                  <div className="edith-ai__modules">
                    {MODULE_CARDS.map((m, i) => (
                      <motion.div
                        key={m.href}
                        initial={motionOff ? false : { opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.12 + i * 0.05, duration: 0.32 }}
                      >
                        <Link href={m.href} className="edith-ai__module">
                          <span className="edith-ai__module-icon">
                            <i className={`bi ${m.icon}`} />
                          </span>
                          <span>
                            <strong>{m.label}</strong>
                            <small>{m.hint}</small>
                          </span>
                        </Link>
                      </motion.div>
                    ))}
                  </div>

                  <div className="edith-ai__chips">
                    {[
                      { label: "Show my tasks", icon: "bi-check2-square" },
                      { label: "Who is doing what?", icon: "bi-people" },
                      { label: "My to-dos", icon: "bi-list-check" },
                    ].map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        className="edith-ai__chip"
                        disabled={busy}
                        onClick={() => void send(c.label)}
                      >
                        <i className={`bi ${c.icon}`} />
                        {c.label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="thread"
                  className="edith-ai__thread"
                  initial={motionOff ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {messages.map((m, i) => (
                    <motion.div
                      key={m.id ?? `${m.role}-${i}`}
                      className={`edith-ai__row edith-ai__row--${m.role}`}
                      initial={motionOff ? false : { opacity: 0, y: 14, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {m.role === "assistant" && (
                        <span className="edith-ai__avatar" title="EDITH">
                          <EdithOrb size="xs" />
                        </span>
                      )}
                      <div className="edith-ai__stack">
                      <div className={`edith-ai__bubble edith-ai__bubble--${m.role}`}>
                        {m.role === "assistant" && (
                          <div className="edith-ai__bubble-head">
                            <strong>EDITH</strong>
                            <span className="edith-ai__bubble-actions">
                              {tts.supported && (
                                <button
                                  type="button"
                                  className="edith-ai__copy"
                                  onClick={() => {
                                    speech.stop();
                                    tts.speak(m.content, { force: true });
                                  }}
                                  title="Read aloud"
                                  aria-label="Read aloud"
                                >
                                  <i className="bi bi-volume-up" />
                                </button>
                              )}
                              <button
                                type="button"
                                className="edith-ai__copy"
                                onClick={() => void copyReply(m.content)}
                                title="Copy"
                              >
                                <i className="bi bi-clipboard" />
                              </button>
                            </span>
                          </div>
                        )}
                        {m.attachments && m.attachments.length > 0 && (
                          <div className="edith-ai__thumbs">
                            {m.attachments.map((a, ai) =>
                              a.type === "document" || (!a.mime && !a.url?.startsWith("data:image")) ? (
                                <a
                                  key={ai}
                                  href={a.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="edith-ai__doc"
                                >
                                  <i className="bi bi-file-earmark-pdf-fill" />
                                  <span>{a.name || "Download PDF"}</span>
                                </a>
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={ai} src={a.url} alt="Attached" className="edith-ai__thumb" />
                              ),
                            )}
                          </div>
                        )}
                        {m.content ? (
                          <div className="edith-ai__text">{renderRichContent(m.content)}</div>
                        ) : null}
                        {m.links && m.links.length > 0 && (
                          <div className="edith-ai__actions">
                            {m.links.map((l) =>
                              l.href.startsWith("http") ? (
                                <a
                                  key={l.href}
                                  href={l.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="edith-ai__action"
                                >
                                  <i className={`bi ${l.icon || "bi-arrow-right-circle"}`} />
                                  <span>{l.label}</span>
                                  <i className="bi bi-box-arrow-up-right" />
                                </a>
                              ) : (
                                <Link key={l.href} href={l.href} className="edith-ai__action">
                                  <i className={`bi ${l.icon || "bi-arrow-right-circle"}`} />
                                  <span>{l.label}</span>
                                  <i className="bi bi-chevron-right" />
                                </Link>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                      {m.role === "assistant" ? <EdithVisualCards cards={m.cards} /> : null}
                      </div>
                    </motion.div>
                  ))}

                  {busy && (
                    <div className="edith-ai__row edith-ai__row--assistant">
                      <span className="edith-ai__avatar">
                        <EdithOrb size="xs" />
                      </span>
                      <div className="edith-ai__bubble edith-ai__bubble--assistant edith-ai__typing">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <form
            className="edith-ai__composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send(
                speech.listening && interimVoice ? `${input}${interimVoice}` : input,
              );
            }}
          >
            {pendingImages.length > 0 && (
              <div className="edith-ai__pending">
                {pendingImages.map((img, i) => (
                  <div key={i} className="edith-ai__pending-item">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" />
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={() => setPendingImages((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <i className="bi bi-x" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="edith-ai__input-wrap">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => void addImages(e.target.files)}
              />
              <button
                type="button"
                className="edith-ai__attach"
                disabled={busy || !enabled || pendingImages.length >= 3}
                aria-label="Attach image"
                title="Attach image"
                onClick={() => fileRef.current?.click()}
              >
                <i className="bi bi-plus-lg" />
              </button>
              <textarea
                ref={inputRef}
                rows={1}
                placeholder={
                  speech.listening
                    ? "Listening… speak now"
                    : "Ask EDITH anything — type, speak, or attach an image…"
                }
                value={
                  speech.listening && interimVoice
                    ? `${input}${interimVoice}`
                    : input
                }
                disabled={busy || !enabled}
                onChange={(e) => {
                  const v = e.target.value;
                  setInput(v);
                  baseInputRef.current = v;
                  setInterimVoice("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(
                      speech.listening && interimVoice
                        ? `${input}${interimVoice}`
                        : input,
                    );
                  }
                }}
              />
              {speech.supported && (
                <button
                  type="button"
                  className={`edith-ai__mic${speech.listening ? " is-listening" : ""}`}
                  disabled={busy || !enabled}
                  aria-label={speech.listening ? "Stop voice input" : "Start voice input"}
                  title={speech.listening ? "Stop listening" : "Voice to text"}
                  onClick={() => {
                    if (!speech.listening) {
                      tts.stop();
                      baseInputRef.current = input;
                      setInterimVoice("");
                    }
                    speech.toggle();
                    inputRef.current?.focus();
                  }}
                >
                  <i className={`bi ${speech.listening ? "bi-mic-fill" : "bi-mic"}`} />
                </button>
              )}
              <button
                type="submit"
                className="edith-ai__send"
                disabled={
                  busy ||
                  (!(speech.listening && interimVoice ? `${input}${interimVoice}` : input).trim() &&
                    pendingImages.length === 0)
                }
                aria-label="Send"
              >
                <i className="bi bi-arrow-up" />
              </button>
            </div>
          </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRelative(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 15) return `${days}d ago`;
  return d.toLocaleDateString();
}

function renderRichContent(text: string) {
  const blocks = text.split("\n");
  return blocks.map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <br key={i} />;
    if (trimmed.startsWith("• ") || trimmed.startsWith("- ") || trimmed.startsWith("– ")) {
      return (
        <div key={i} className="edith-ai__bullet">
          <span className="edith-ai__bullet-dot" />
          <span>{renderInline(trimmed.replace(/^[•\-–]\s*/, ""))}</span>
        </div>
      );
    }
    return (
      <p key={i} className="edith-ai__para">
        {renderInline(line)}
      </p>
    );
  });
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}
