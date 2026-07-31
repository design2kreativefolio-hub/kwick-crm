"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { api, ApiError, tokens, unwrapList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLiveUpdates } from "@/lib/liveUpdates";
import { useToast } from "@/lib/toast";

type Message = {
  id: number;
  conversation: number;
  sender: number;
  sender_name: string;
  body: string;
  attachment_url: string;
  attachment_type: "" | "image" | "video" | "document";
  attachment_name: string;
  created_at: string;
};

type Participant = { id: number; full_name: string; email: string };

type Conversation = {
  id: number;
  participants: number[];
  is_group: boolean;
  name: string;
  other_participant: Participant | null;
  participants_detail: Participant[] | null;
  last_message: Message | null;
  unread_count: number;
  created_at: string;
};

type Contact = { id: number; full_name: string; email: string; role: string };

const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE_URL ?? "ws://localhost:8000";
const MAX_ATTACHMENT_SIZE = 30 * 1024 * 1024; // 30MB — mirrors the backend limit

function initials(name: string) {
  return (name || "?").trim()[0]?.toUpperCase() || "?";
}
function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function conversationName(c: Conversation) {
  if (c.is_group) return c.name || "Group Chat";
  return c.other_participant?.full_name || c.other_participant?.email || "Unknown";
}
function ConversationPreview({ c }: { c: Conversation }) {
  const last = c.last_message;
  if (!last) return <>Say hello</>;
  if (last.attachment_type === "image")
    return (
      <>
        <i className="bi bi-image-fill" style={{ marginRight: 4 }} /> Photo
      </>
    );
  if (last.attachment_type === "video")
    return (
      <>
        <i className="bi bi-camera-reels-fill" style={{ marginRight: 4 }} /> Video
      </>
    );
  if (last.attachment_type === "document")
    return (
      <>
        <i className="bi bi-file-earmark-pdf-fill" style={{ marginRight: 4, color: "var(--danger)" }} /> Document
      </>
    );
  return <>{last.body}</>;
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { refreshCounts } = useLiveUpdates();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatMode, setNewChatMode] = useState<"chat" | "group">("chat");
  const [newChatSearch, setNewChatSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupSelection, setGroupSelection] = useState<number[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadConversations = () => {
    api<Conversation[] | { results: Conversation[] }>("/api/messages/conversations")
      .then((d) => setConversations(unwrapList(d)))
      .catch(() => {});
  };

  useEffect(() => {
    loadConversations();
    api<Contact[]>("/api/messages/directory").then(setContacts).catch(() => {});
  }, []);

  // Deep link from a "new message" toast/notification (?conversation=<id>) —
  // re-runs on every change so clicking a second toast while already on this
  // page still jumps to the right thread.
  useEffect(() => {
    const raw = searchParams.get("conversation");
    if (raw) setSelectedId(Number(raw));
  }, [searchParams]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setMessages([]);

    api<Message[]>(`/api/messages/conversations/${selectedId}/messages`).then((d) => {
      if (!cancelled) setMessages(d);
    });
    api(`/api/messages/conversations/${selectedId}/read`, { method: "POST" })
      .then(() => {
        setConversations((prev) => prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c)));
        refreshCounts();
      })
      .catch(() => {});

    const socket = new WebSocket(`${WS_BASE}/ws/messages/${selectedId}/?token=${tokens.access ?? ""}`);
    socket.onmessage = (e) => {
      const msg: Message = JSON.parse(e.data);
      setMessages((prev) => [...prev, msg]);
      setConversations((prev) => prev.map((c) => (c.id === selectedId ? { ...c, last_message: msg } : c)));
    };
    wsRef.current = socket;

    return () => {
      cancelled = true;
      socket.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!previewImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewImage]);

  const sendMessage = () => {
    const body = draft.trim();
    if (!body || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ body }));
    setDraft("");
  };

  const pickAttachment = () => fileInputRef.current?.click();

  const uploadAttachment = async (file: File) => {
    if (!selectedId) return;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      showToast("That file is over the 30MB limit.", "error");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      await api(`/api/messages/conversations/${selectedId}/attachments`, { method: "POST", body });
      // The backend broadcasts the new message over this conversation's WS
      // group (including back to us), so no local append needed here.
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't send that file." : err.message, "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startConversation = async (contact: Contact) => {
    const existing = conversations.find((c) => !c.is_group && c.other_participant?.id === contact.id);
    if (existing) {
      setSelectedId(existing.id);
      setShowNewChat(false);
      return;
    }
    try {
      const convo = await api<Conversation>("/api/messages/conversations", {
        method: "POST",
        body: JSON.stringify({ participant: contact.id }),
      });
      setConversations((prev) => [convo, ...prev]);
      setSelectedId(convo.id);
      setShowNewChat(false);
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't start chat." : err.message, "error");
    }
  };

  const toggleGroupMember = (id: number) => {
    setGroupSelection((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const createGroup = async () => {
    if (groupSelection.length < 2 || !groupName.trim()) return;
    setCreatingGroup(true);
    try {
      const convo = await api<Conversation>("/api/messages/conversations", {
        method: "POST",
        body: JSON.stringify({ participants: groupSelection, name: groupName.trim() }),
      });
      setConversations((prev) => [convo, ...prev]);
      setSelectedId(convo.id);
      showToast("Group created.");
      closeNewChat();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't create group." : err.message, "error");
    } finally {
      setCreatingGroup(false);
    }
  };

  const closeNewChat = () => {
    setShowNewChat(false);
    setNewChatMode("chat");
    setNewChatSearch("");
    setGroupName("");
    setGroupSelection([]);
  };

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...conversations].sort((a, b) => {
      const ta = a.last_message?.created_at ?? a.created_at;
      const tb = b.last_message?.created_at ?? b.created_at;
      return tb.localeCompare(ta);
    });
    if (!q) return sorted;
    return sorted.filter((c) => conversationName(c).toLowerCase().includes(q));
  }, [conversations, search]);

  const modalContacts = useMemo(() => {
    const q = newChatSearch.trim().toLowerCase();
    return contacts.filter(
      (c) => !q || c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  }, [contacts, newChatSearch]);

  const groupedMessages = useMemo(() => {
    const groups: { date: string; items: Message[] }[] = [];
    for (const m of messages) {
      const label = dateLabel(m.created_at);
      const last = groups[groups.length - 1];
      if (last && last.date === label) last.items.push(m);
      else groups.push({ date: label, items: [m] });
    }
    return groups;
  }, [messages]);

  return (
    <div className="card chat-shell" style={outer}>
      <div className={`chat-list-pane${selected ? " chat-pane-hidden-mobile" : ""}`} style={leftPane}>
        <div style={ownHeader}>
          <span style={avatar}>{initials(user?.full_name || user?.email || "?")}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>
              {user?.full_name || "You"}
            </div>
            <div className="muted" style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis" }}>
              {user?.email}
            </div>
          </div>
          <button className="icon-btn-anim" style={newChatBtn} onClick={() => setShowNewChat(true)} aria-label="New chat">
            <i className="bi bi-plus-lg" />
          </button>
        </div>

        <div style={{ padding: "12px 16px" }}>
          <div style={searchWrap}>
            <i className="bi bi-search" style={{ color: "var(--text-muted)", fontSize: 13 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              style={searchInput}
            />
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "0 8px 12px" }}>
          <div style={sectionLabel}>Recent Chats</div>
          {filteredConversations.length === 0 && (
            <p className="muted" style={{ fontSize: 12.5, padding: "4px 10px" }}>
              No conversations yet.
            </p>
          )}
          {filteredConversations.map((c) => {
            const name = conversationName(c);
            return (
              <button key={c.id} onClick={() => setSelectedId(c.id)} style={{ ...convoRow, background: selectedId === c.id ? "var(--gold-soft)" : "transparent" }}>
                <span style={{ ...avatar, background: c.is_group ? "#7C4FE0" : "var(--navy)" }}>
                  {c.is_group ? <i className="bi bi-people-fill" style={{ fontSize: 15 }} /> : initials(name)}
                </span>
                <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {name}
                  </div>
                  <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <ConversationPreview c={c} />
                  </div>
                </span>
                {c.unread_count > 0 && <span style={unreadDot}>{c.unread_count > 9 ? "9+" : c.unread_count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`chat-thread-pane${!selected ? " chat-pane-hidden-mobile" : ""}`} style={rightPane}>
        {!selected ? (
          <div style={emptyState}>
            <i className="bi bi-chat-dots-fill" style={{ fontSize: 34, color: "var(--text-muted)" }} />
            <p className="muted" style={{ marginTop: 10 }}>Select a conversation to start chatting.</p>
            <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => setShowNewChat(true)}>
              <i className="bi bi-plus-lg" /> New chat
            </button>
          </div>
        ) : (
          <>
            <div style={threadHeader}>
              <button
                className="chat-back-btn icon-btn-anim"
                style={rowIconBtn}
                onClick={() => setSelectedId(null)}
                aria-label="Back to conversations"
              >
                <i className="bi bi-arrow-left" />
              </button>
              <span style={{ ...avatar, background: selected.is_group ? "#7C4FE0" : "var(--navy)" }}>
                {selected.is_group ? <i className="bi bi-people-fill" style={{ fontSize: 15 }} /> : initials(conversationName(selected))}
              </span>
              <span>
                <span style={{ fontSize: 15, fontWeight: 700, display: "block" }}>{conversationName(selected)}</span>
                {selected.is_group && selected.participants_detail && (
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {selected.participants_detail.map((p) => p.full_name || p.email).join(", ")}
                  </span>
                )}
              </span>
            </div>

            <div ref={scrollRef} style={thread}>
              {groupedMessages.map((group) => (
                <div key={group.date}>
                  <div style={dateSeparator}>{group.date}</div>
                  {group.items.map((m) => {
                    const own = m.sender === user?.id;
                    return (
                      <div key={m.id} style={{ display: "flex", justifyContent: own ? "flex-end" : "flex-start", marginBottom: 4 }}>
                        {!own && <span style={{ ...avatar, width: 30, height: 30, minWidth: 30, fontSize: 12, marginRight: 8 }}>{initials(m.sender_name)}</span>}
                        <div style={{ maxWidth: 380 }}>
                          {!own && selected.is_group && (
                            <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>{m.sender_name}</div>
                          )}
                          {m.attachment_url ? (
                            <div style={{ ...bubble, ...(own ? bubbleOwn : bubbleOther), padding: m.attachment_type === "document" ? "10px 14px" : 6 }}>
                              {m.attachment_type === "image" ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={m.attachment_url}
                                  alt={m.attachment_name}
                                  style={{ ...attachmentMedia, cursor: "pointer" }}
                                  onClick={() => setPreviewImage(m.attachment_url)}
                                />
                              ) : m.attachment_type === "video" ? (
                                <video src={m.attachment_url} controls style={attachmentMedia} />
                              ) : (
                                <a
                                  href={m.attachment_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={documentLink}
                                >
                                  <i className="bi bi-file-earmark-pdf-fill" style={{ fontSize: 22, color: "var(--danger)" }} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {m.attachment_name || "Document.pdf"}
                                  </span>
                                  <i className="bi bi-download" style={{ fontSize: 13 }} />
                                </a>
                              )}
                            </div>
                          ) : (
                            <div style={{ ...bubble, ...(own ? bubbleOwn : bubbleOther) }}>{m.body}</div>
                          )}
                          <div className="muted" style={{ fontSize: 10.5, textAlign: own ? "right" : "left", marginTop: 2 }}>
                            {timeLabel(m.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div style={inputRow}>
              <input ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf" style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadAttachment(file);
                }}
              />
              <button className="icon-btn-anim" style={attachBtn} onClick={pickAttachment} disabled={uploading} aria-label="Attach image, video or PDF" title="Attach image, video or PDF (30MB limit)">
                <i className="bi bi-plus-lg" />
              </button>
              <input
                className="input"
                placeholder={uploading ? "Uploading…" : "Send message"}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                style={{ flex: 1 }}
              />
              <button className="icon-btn-anim" style={sendBtn} onClick={sendMessage} disabled={!draft.trim()} aria-label="Send">
                <i className="bi bi-send-fill" style={{ fontSize: 14 }} />
              </button>
            </div>
          </>
        )}
      </div>

      {showNewChat && (
        <div style={modalOverlay} onClick={closeNewChat}>
          <div className="card" style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>New Chat</span>
              <button className="icon-btn-anim" style={rowIconBtn} onClick={closeNewChat} aria-label="Close">
                <i className="bi bi-x-lg" style={{ fontSize: 13 }} />
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button
                className={newChatMode === "chat" ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
                onClick={() => setNewChatMode("chat")}
              >
                Direct Message
              </button>
              <button
                className={newChatMode === "group" ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
                onClick={() => setNewChatMode("group")}
              >
                <i className="bi bi-people-fill" /> New Group
              </button>
            </div>

            {newChatMode === "group" && (
              <input
                className="input"
                placeholder="Group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                style={{ marginBottom: 10 }}
              />
            )}

            <input
              className="input"
              placeholder="Search people…"
              value={newChatSearch}
              onChange={(e) => setNewChatSearch(e.target.value)}
              style={{ marginBottom: 10 }}
            />

            <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: newChatMode === "group" ? 12 : 0 }}>
              {modalContacts.length === 0 && <p className="muted" style={{ fontSize: 12.5 }}>No colleagues found.</p>}
              {modalContacts.map((contact) => (
                <label key={contact.id} style={contactRow}>
                  {newChatMode === "group" && (
                    <input
                      type="checkbox"
                      checked={groupSelection.includes(contact.id)}
                      onChange={() => toggleGroupMember(contact.id)}
                    />
                  )}
                  <span style={{ ...avatar, width: 32, height: 32, minWidth: 32, fontSize: 12 }}>
                    {initials(contact.full_name || contact.email)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{contact.full_name || contact.email}</div>
                    <div className="muted" style={{ fontSize: 11, textTransform: "capitalize" }}>{contact.role}</div>
                  </span>
                  {newChatMode === "chat" && (
                    <button className="btn btn-ghost btn-sm" onClick={() => startConversation(contact)}>
                      Chat
                    </button>
                  )}
                </label>
              ))}
            </div>

            {newChatMode === "group" && (
              <button
                className="btn"
                style={{ width: "100%" }}
                onClick={createGroup}
                disabled={creatingGroup || groupSelection.length < 2 || !groupName.trim()}
              >
                {creatingGroup ? "Creating…" : `Create Group${groupSelection.length ? ` (${groupSelection.length})` : ""}`}
              </button>
            )}
          </div>
        </div>
      )}

      {previewImage && (
        <div style={imagePreviewOverlay} onClick={() => setPreviewImage(null)}>
          <button
            className="icon-btn-anim"
            style={imagePreviewCloseBtn}
            onClick={() => setPreviewImage(null)}
            aria-label="Close preview"
          >
            <i className="bi bi-x-lg" />
          </button>
          <a
            href={previewImage}
            target="_blank"
            rel="noreferrer"
            style={imagePreviewDownloadBtn}
            onClick={(e) => e.stopPropagation()}
            aria-label="Open original"
          >
            <i className="bi bi-download" />
          </a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewImage}
            alt=""
            style={imagePreviewImg}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

const outer: React.CSSProperties = {
  padding: 0,
  overflow: "hidden",
  display: "grid",
  height: "calc(100vh - 168px)",
  minHeight: 480,
  position: "relative",
};
const leftPane: React.CSSProperties = {
  borderRight: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};
const ownHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "18px 16px 6px",
};
const newChatBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  minWidth: 32,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--gold-soft)",
  color: "var(--gold)",
  border: "none",
};
const searchWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: "var(--bg)",
  borderRadius: 999,
  padding: "9px 14px",
};
const searchInput: React.CSSProperties = {
  border: "none",
  outline: "none",
  background: "transparent",
  flex: 1,
  fontSize: 13,
  color: "var(--text)",
};
const sectionLabel: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  color: "var(--text-muted)",
  padding: "12px 10px 6px",
};
const convoRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "9px 10px",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
};
const avatar: React.CSSProperties = {
  width: 38,
  height: 38,
  minWidth: 38,
  borderRadius: "50%",
  background: "var(--navy)",
  color: "#fff",
  display: "grid",
  placeItems: "center",
  fontWeight: 700,
  fontSize: 14,
};
const unreadDot: React.CSSProperties = {
  minWidth: 18,
  height: 18,
  borderRadius: 999,
  background: "var(--danger)",
  color: "#fff",
  fontSize: 10,
  fontWeight: 700,
  display: "grid",
  placeItems: "center",
  padding: "0 4px",
};
const rightPane: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};
const threadHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "16px 20px",
  borderBottom: "1px solid var(--border)",
};
const thread: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "20px",
};
const dateSeparator: React.CSSProperties = {
  textAlign: "center",
  fontSize: 11.5,
  color: "var(--text-muted)",
  margin: "14px 0",
};
const bubble: React.CSSProperties = {
  maxWidth: 380,
  padding: "10px 14px",
  borderRadius: 14,
  fontSize: 13.5,
  lineHeight: 1.4,
  wordBreak: "break-word",
};
const bubbleOther: React.CSSProperties = {
  background: "var(--bg)",
  color: "var(--text)",
  borderBottomLeftRadius: 4,
};
const bubbleOwn: React.CSSProperties = {
  background: "var(--blue-100)",
  color: "var(--navy)",
  borderBottomRightRadius: 4,
  marginLeft: "auto",
};
const attachmentMedia: React.CSSProperties = {
  maxWidth: 320,
  maxHeight: 260,
  borderRadius: 10,
  display: "block",
};
const documentLink: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 200,
  maxWidth: 300,
  color: "inherit",
  textDecoration: "none",
};
const inputRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  padding: "14px 20px",
  borderTop: "1px solid var(--border)",
};
const attachBtn: React.CSSProperties = {
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
const sendBtn: React.CSSProperties = {
  width: 38,
  height: 38,
  minWidth: 38,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--gold)",
  color: "#fff",
  border: "none",
};
const emptyState: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};
const modalOverlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(16, 19, 63, 0.35)",
  display: "grid",
  placeItems: "center",
  zIndex: 30,
};
const imagePreviewOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10, 12, 30, 0.88)",
  display: "grid",
  placeItems: "center",
  zIndex: 100,
  cursor: "zoom-out",
};
const imagePreviewImg: React.CSSProperties = {
  maxWidth: "90vw",
  maxHeight: "88vh",
  borderRadius: 8,
  boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
  cursor: "default",
};
const imagePreviewCloseBtn: React.CSSProperties = {
  position: "fixed",
  top: 18,
  right: 18,
  width: 42,
  height: 42,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "rgba(255, 255, 255, 0.12)",
  color: "#fff",
  border: "none",
  fontSize: 16,
  zIndex: 101,
};
const imagePreviewDownloadBtn: React.CSSProperties = {
  position: "fixed",
  top: 18,
  right: 70,
  width: 42,
  height: 42,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "rgba(255, 255, 255, 0.12)",
  color: "#fff",
  border: "none",
  fontSize: 16,
  zIndex: 101,
};
const modalCard: React.CSSProperties = {
  width: 380,
  maxHeight: "80%",
  display: "flex",
  flexDirection: "column",
};
const rowIconBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  minWidth: 28,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--bg)",
  border: "none",
};
const contactRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 4px",
  cursor: "pointer",
};
