"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { useConfirm } from "@/components/ConfirmDialog";
import { EmojiPicker } from "@/components/EmojiPicker";
import { MediaFileLink } from "@/components/MediaFileLink";
import { UserAvatar } from "@/components/UserAvatar";
import { api, ApiError, refreshSession, unwrapList, wsUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLiveUpdates } from "@/lib/liveUpdates";
import { useToast } from "@/lib/toast";

type Message = {
  id: number;
  conversation: number;
  sender: number;
  sender_name: string;
  sender_avatar_url?: string;
  body: string;
  is_system?: boolean;
  attachment_url: string;
  attachment_type: "" | "image" | "video" | "document";
  attachment_name: string;
  created_at: string;
};

type Participant = { id: number; full_name: string; email: string; avatar_url?: string };

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

type Contact = { id: number; full_name: string; email: string; role: string; avatar_url?: string };

const MAX_ATTACHMENT_SIZE = 30 * 1024 * 1024; // 30MB — mirrors the backend limit

type PendingAttachment = {
  file: File;
  previewUrl: string;
  kind: "image" | "video" | "document";
};

function attachmentKind(file: File): PendingAttachment["kind"] | null {
  const mime = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (mime.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp)$/i.test(name)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(name)) return "video";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "document";
  return null;
}

function fileFromClipboardItem(item: DataTransferItem): File | null {
  if (item.kind !== "file" || !item.type.startsWith("image/")) return null;
  const file = item.getAsFile();
  if (!file) return null;
  if (file.name && file.name !== "image.png") return file;
  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
  return new File([file], `pasted-image.${ext}`, { type: file.type || "image/png" });
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function ChatAvatar({
  name,
  email,
  avatarUrl,
  size = 38,
  group = false,
  style,
}: {
  name?: string;
  email?: string;
  avatarUrl?: string;
  size?: number;
  group?: boolean;
  style?: React.CSSProperties;
}) {
  if (group) {
    return (
      <span
        style={{
          ...avatar,
          width: size,
          height: size,
          minWidth: size,
          background: "#7C4FE0",
          color: "var(--on-brand)",
          ...style,
        }}
      >
        <i className="bi bi-people-fill" style={{ fontSize: Math.max(12, size * 0.4) }} />
      </span>
    );
  }
  return (
    <UserAvatar
      user={{ full_name: name || "", email: email || "", profile: { avatar_url: avatarUrl || "" } }}
      size={size}
      style={style}
    />
  );
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
  if (last.is_system) return <>{last.body}</>;
  if (last.attachment_type === "image")
    return (
      <>
        <i className="bi bi-image-fill" style={{ marginRight: 4 }} /> {last.body || "Photo"}
      </>
    );
  if (last.attachment_type === "video")
    return (
      <>
        <i className="bi bi-camera-reels-fill" style={{ marginRight: 4 }} /> {last.body || "Video"}
      </>
    );
  if (last.attachment_type === "document")
    return (
      <>
        <i className="bi bi-file-earmark-pdf-fill" style={{ marginRight: 4, color: "var(--danger)" }} /> {last.body || "Document"}
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
  const { refreshCounts, setActiveChatId, reduceChatUnread } = useLiveUpdates();
  const { confirm, ConfirmDialog } = useConfirm();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const draftInputRef = useRef<HTMLTextAreaElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatActionBusy, setChatActionBusy] = useState(false);

  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatMode, setNewChatMode] = useState<"chat" | "group">("chat");
  const [newChatSearch, setNewChatSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupSelection, setGroupSelection] = useState<number[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [showEditGroup, setShowEditGroup] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [editSelection, setEditSelection] = useState<number[]>([]);
  const [editGroupSearch, setEditGroupSearch] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadConversations = () => {
    api<Conversation[] | { results: Conversation[] }>("/api/messages/conversations?page_size=200")
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

  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    setActiveChatId(selectedId);
    return () => setActiveChatId(null);
  }, [selectedId, setActiveChatId]);

  const markThreadRead = (conversationId: number) => {
    api(`/api/messages/conversations/${conversationId}/read`, { method: "POST" })
      .then(() => refreshCounts())
      .catch(() => {});
  };

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    setMenuOpen(false);

    const unread = conversationsRef.current.find((c) => c.id === selectedId)?.unread_count || 0;
    if (unread > 0) reduceChatUnread(unread);
    setConversations((prev) => prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c)));

    api<Message[]>(`/api/messages/conversations/${selectedId}/messages`)
      .then((d) => {
        if (!cancelled) setMessages(Array.isArray(d) ? d : []);
      })
      .catch(() => {});
    markThreadRead(selectedId);

    const handleMessage = (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      if (data?.event === "cleared") {
        setMessages([]);
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedId ? { ...c, last_message: null } : c))
        );
        return;
      }
      if (data?.event === "deleted") {
        setConversations((prev) => prev.filter((c) => c.id !== selectedId));
        setSelectedId(null);
        setMessages([]);
        return;
      }
      if (data?.event === "members_updated" && data.conversation) {
        const updated = data.conversation as Conversation;
        setConversations((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
        return;
      }
      if (data?.event === "kicked") {
        const kickedIds: number[] = data.user_ids || [];
        if (user?.id && kickedIds.includes(user.id)) {
          setConversations((prev) => prev.filter((c) => c.id !== selectedId));
          setSelectedId(null);
          setMessages([]);
          showToast("You were removed from the group.");
        }
        return;
      }
      const msg = data as Message;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, last_message: msg, unread_count: 0 } : c))
      );
      if (!msg.is_system && msg.sender !== user?.id && document.visibilityState === "visible") {
        markThreadRead(selectedId);
      }
    };

    const connect = () => {
      if (cancelled) return;
      const socket = new WebSocket(wsUrl(`/ws/messages/${selectedId}/`));
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
      wsRef.current = socket;
    };

    void connect();

    const onVisible = () => {
      if (document.visibilityState === "visible") markThreadRead(selectedId);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
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

  useEffect(() => {
    setDraft("");
    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [selectedId]);

  useEffect(() => {
    const el = draftInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 40), 120)}px`;
  }, [draft, selectedId, pendingAttachment]);

  const clearPendingAttachment = () => {
    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const stageAttachment = (file: File) => {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      showToast("That file is over the 30MB limit.", "error");
      return;
    }
    const kind = attachmentKind(file);
    if (!kind) {
      showToast("Only images, videos, or PDFs can be attached.", "error");
      return;
    }
    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return {
        file,
        kind,
        previewUrl: kind === "document" ? "" : URL.createObjectURL(file),
      };
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    requestAnimationFrame(() => draftInputRef.current?.focus());
  };

  const sendMessage = async () => {
    if (!selectedId || uploading) return;
    const body = draft.trim();
    const pending = pendingAttachment;

    if (pending) {
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", pending.file);
        if (body) form.append("body", body);
        await api(`/api/messages/conversations/${selectedId}/attachments`, { method: "POST", body: form });
        setDraft("");
        clearPendingAttachment();
      } catch (err: any) {
        showToast(err instanceof ApiError ? "Couldn't send that file." : err.message, "error");
      } finally {
        setUploading(false);
      }
      return;
    }

    if (!body || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ body }));
    setDraft("");
  };

  const pickAttachment = () => fileInputRef.current?.click();

  const onComposerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if ([...e.dataTransfer.types].includes("Files")) setDragOver(true);
  };

  const onComposerDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setDragOver(false);
  };

  const onComposerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) stageAttachment(file);
  };

  const insertAtCursor = (text: string) => {
    const el = draftInputRef.current;
    if (!el) {
      setDraft((d) => d + text);
      return;
    }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = `${draft.slice(0, start)}${text}${draft.slice(end)}`;
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const insertEmoji = (emoji: string) => insertAtCursor(emoji);

  const onComposerPaste = (e: React.ClipboardEvent) => {
    const clip = e.clipboardData;
    if (!clip) return;
    const fromItems = [...clip.items].map(fileFromClipboardItem).find((f): f is File => !!f);
    const fromFiles = clip.files?.[0];
    const file = fromItems || (fromFiles && attachmentKind(fromFiles) ? fromFiles : null);
    if (!file || !attachmentKind(file)) return;
    e.preventDefault();
    stageAttachment(file);
  };

  const clearChat = async () => {
    if (!selectedId) return;
    setMenuOpen(false);
    const ok = await confirm("Clear all messages in this chat? The conversation will stay.", {
      title: "Clear chat",
      confirmLabel: "Clear",
      danger: true,
    });
    if (!ok) return;
    setChatActionBusy(true);
    try {
      await api(`/api/messages/conversations/${selectedId}/clear`, { method: "POST" });
      setMessages([]);
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, last_message: null } : c))
      );
      showToast("Chat cleared.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't clear chat." : err.message, "error");
    } finally {
      setChatActionBusy(false);
    }
  };

  const deleteChat = async () => {
    if (!selectedId) return;
    const id = selectedId;
    setMenuOpen(false);
    const ok = await confirm("Delete this chat for everyone? Messages cannot be recovered.", {
      title: "Delete chat",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setChatActionBusy(true);
    try {
      await api(`/api/messages/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setSelectedId(null);
      setMessages([]);
      showToast("Chat deleted.");
      refreshCounts();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't delete chat." : err.message, "error");
    } finally {
      setChatActionBusy(false);
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

  const openEditGroup = () => {
    if (!selected?.is_group) return;
    setMenuOpen(false);
    setEditGroupName(selected.name || "");
    const ids = (selected.participants_detail || []).map((p) => p.id);
    if (user?.id && !ids.includes(user.id)) ids.push(user.id);
    setEditSelection(ids);
    setEditGroupSearch("");
    setShowEditGroup(true);
  };

  const toggleEditMember = (id: number) => {
    setEditSelection((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const saveEditGroup = async () => {
    if (!selected?.is_group || !user) return;
    const current = new Set((selected.participants_detail || []).map((p) => p.id));
    const nextMembers = new Set(editSelection);
    if (nextMembers.size < 2) {
      showToast("A group needs at least 2 members.", "error");
      return;
    }
    const add = [...nextMembers].filter((id) => !current.has(id));
    const remove = [...current].filter((id) => !nextMembers.has(id));
    const nameChanged = editGroupName.trim() && editGroupName.trim() !== (selected.name || "");
    if (!add.length && !remove.length && !nameChanged) {
      setShowEditGroup(false);
      return;
    }
    setSavingGroup(true);
    try {
      const res = await api<Conversation | { detail: string; conversation_id: number }>(
        `/api/messages/conversations/${selected.id}/members`,
        {
          method: "POST",
          body: JSON.stringify({
            add,
            remove,
            ...(nameChanged ? { name: editGroupName.trim() } : {}),
          }),
        }
      );
      if (res && "detail" in res && res.detail === "left") {
        setConversations((prev) => prev.filter((c) => c.id !== selected.id));
        setSelectedId(null);
        setMessages([]);
        showToast("You left the group.");
      } else {
        const updated = res as Conversation;
        setConversations((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
        const msgs = await api<Message[]>(`/api/messages/conversations/${selected.id}/messages`);
        setMessages(msgs);
        showToast("Group updated.");
      }
      setShowEditGroup(false);
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't update group." : err.message, "error");
    } finally {
      setSavingGroup(false);
    }
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

  const editGroupPeople = useMemo(() => {
    const map = new Map<number, { id: number; full_name: string; email: string; role?: string; avatar_url?: string }>();
    for (const c of contacts) map.set(c.id, c);
    for (const p of selected?.participants_detail || []) {
      if (!map.has(p.id)) map.set(p.id, p);
    }
    if (user) {
      map.set(user.id, {
        id: user.id,
        full_name: user.full_name || "You",
        email: user.email || "",
        avatar_url: user.profile?.avatar_url || "",
      });
    }
    const q = editGroupSearch.trim().toLowerCase();
    return [...map.values()]
      .filter((p) => !q || p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
  }, [contacts, selected, user, editGroupSearch]);

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
      {ConfirmDialog}
      <div className={`chat-list-pane${selected ? " chat-pane-hidden-mobile" : ""}`} style={leftPane}>
        <div style={ownHeader}>
          <ChatAvatar
            name={user?.full_name}
            email={user?.email}
            avatarUrl={user?.profile?.avatar_url}
            size={38}
          />
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
                <ChatAvatar
                  name={c.is_group ? conversationName(c) : c.other_participant?.full_name}
                  email={c.other_participant?.email}
                  avatarUrl={c.other_participant?.avatar_url}
                  group={c.is_group}
                  size={38}
                />
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

      <div
        className={`chat-thread-pane${!selected ? " chat-pane-hidden-mobile" : ""}`}
        style={{ ...rightPane, position: "relative" }}
        onDragEnter={selected ? onComposerDragOver : undefined}
        onDragOver={selected ? onComposerDragOver : undefined}
        onDragLeave={selected ? onComposerDragLeave : undefined}
        onDrop={selected ? onComposerDrop : undefined}
      >
        {selected && dragOver && (
          <div style={dropOverlay} aria-hidden>
            <div style={dropOverlayCard}>
              <i className="bi bi-cloud-arrow-up" style={{ fontSize: 28 }} />
              <span>Drop to attach</span>
              <span className="muted" style={{ fontSize: 12 }}>Images, videos, or PDFs · up to 30MB</span>
            </div>
          </div>
        )}
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
              <ChatAvatar
                name={selected.is_group ? conversationName(selected) : selected.other_participant?.full_name}
                email={selected.other_participant?.email}
                avatarUrl={selected.other_participant?.avatar_url}
                group={selected.is_group}
                size={38}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 700, display: "block" }}>{conversationName(selected)}</span>
                {selected.is_group && selected.participants_detail && (
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {selected.participants_detail.map((p) => p.full_name || p.email).join(", ")}
                  </span>
                )}
              </span>
              <div style={{ position: "relative" }}>
                <button
                  className="icon-btn-anim"
                  style={rowIconBtn}
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label="Chat options"
                  disabled={chatActionBusy}
                >
                  <i className="bi bi-three-dots-vertical" />
                </button>
                {menuOpen && (
                  <>
                    <div style={menuBackdrop} onClick={() => setMenuOpen(false)} />
                    <div style={chatMenu}>
                      {selected.is_group && (
                        <button type="button" style={chatMenuItem} onClick={openEditGroup} disabled={chatActionBusy}>
                          <i className="bi bi-people-fill" /> Edit group
                        </button>
                      )}
                      <button type="button" style={chatMenuItem} onClick={clearChat} disabled={chatActionBusy}>
                        <i className="bi bi-eraser-fill" /> Clear chat
                      </button>
                      <button
                        type="button"
                        style={{ ...chatMenuItem, color: "var(--danger)" }}
                        onClick={deleteChat}
                        disabled={chatActionBusy}
                      >
                        <i className="bi bi-trash-fill" /> Delete chat
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div ref={scrollRef} style={thread}>
              {groupedMessages.map((group) => (
                <div key={group.date}>
                  <div style={dateSeparator}>{group.date}</div>
                  {group.items.map((m) => {
                    if (m.is_system) {
                      return (
                        <div key={m.id} style={systemMsgRow}>
                          <span style={systemMsgPill}>{m.body}</span>
                        </div>
                      );
                    }
                    const own = m.sender === user?.id;
                    return (
                      <div key={m.id} style={{ display: "flex", justifyContent: own ? "flex-end" : "flex-start", marginBottom: 4 }}>
                        {!own && (
                          <ChatAvatar
                            name={m.sender_name}
                            avatarUrl={m.sender_avatar_url}
                            size={30}
                            style={{ marginRight: 8 }}
                          />
                        )}
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
                                <MediaFileLink url={m.attachment_url} style={documentLink}>
                                  <i className="bi bi-file-earmark-pdf-fill" style={{ fontSize: 22, color: "var(--danger)" }} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {m.attachment_name || "Document.pdf"}
                                  </span>
                                  <i className="bi bi-download" style={{ fontSize: 13 }} />
                                </MediaFileLink>
                              )}
                              {m.body ? (
                                <div style={{ padding: m.attachment_type === "document" ? "8px 0 0" : "8px 8px 4px", fontSize: 13.5, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
                                  {m.body}
                                </div>
                              ) : null}
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

            <div style={composerShell}>
              {pendingAttachment && (
                <div style={pendingStrip}>
                  <div style={pendingPreview}>
                    {pendingAttachment.kind === "image" && pendingAttachment.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pendingAttachment.previewUrl} alt="" style={pendingThumb} />
                    ) : pendingAttachment.kind === "video" && pendingAttachment.previewUrl ? (
                      <video src={pendingAttachment.previewUrl} style={pendingThumb} muted />
                    ) : (
                      <div style={pendingDocIcon}>
                        <i className="bi bi-file-earmark-pdf-fill" />
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {pendingAttachment.file.name}
                      </div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {pendingAttachment.kind === "image" ? "Image" : pendingAttachment.kind === "video" ? "Video" : "PDF"}
                        {" · "}
                        {formatBytes(pendingAttachment.file.size)}
                        {" · Ready to send"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="icon-btn-anim"
                      style={pendingRemoveBtn}
                      onClick={clearPendingAttachment}
                      disabled={uploading}
                      aria-label="Remove attachment"
                      title="Remove"
                    >
                      <i className="bi bi-x-lg" style={{ fontSize: 12 }} />
                    </button>
                  </div>
                </div>
              )}
              <div style={inputRow}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) stageAttachment(file);
                  }}
                />
                <button
                  className="icon-btn-anim"
                  style={attachBtn}
                  onClick={pickAttachment}
                  disabled={uploading}
                  aria-label="Attach image, video or PDF"
                  title="Attach image, video or PDF (30MB limit)"
                >
                  <i className="bi bi-plus-lg" />
                </button>
                <EmojiPicker onPick={insertEmoji} disabled={uploading} />
                <textarea
                  ref={draftInputRef}
                  className="input"
                  rows={1}
                  placeholder={
                    uploading
                      ? "Sending…"
                      : pendingAttachment
                        ? "Add a caption…"
                        : "Send message"
                  }
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onPaste={onComposerPaste}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (e.ctrlKey || e.metaKey || e.shiftKey) {
                      e.preventDefault();
                      insertAtCursor("\n");
                      return;
                    }
                    e.preventDefault();
                    void sendMessage();
                  }}
                  disabled={uploading}
                  style={composerInput}
                />
                <button
                  className="icon-btn-anim"
                  style={sendBtn}
                  onClick={() => void sendMessage()}
                  disabled={uploading || (!draft.trim() && !pendingAttachment)}
                  aria-label="Send"
                >
                  <i className={`bi ${uploading ? "bi-hourglass-split" : "bi-send-fill"}`} style={{ fontSize: 14 }} />
                </button>
              </div>
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
                  <ChatAvatar
                    name={contact.full_name}
                    email={contact.email}
                    avatarUrl={contact.avatar_url}
                    size={32}
                  />
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

      {showEditGroup && selected?.is_group && (
        <div style={modalOverlay} onClick={() => !savingGroup && setShowEditGroup(false)}>
          <div className="card" style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Edit group</span>
              <button
                className="icon-btn-anim"
                style={rowIconBtn}
                onClick={() => setShowEditGroup(false)}
                aria-label="Close"
                disabled={savingGroup}
              >
                <i className="bi bi-x-lg" style={{ fontSize: 13 }} />
              </button>
            </div>

            <label className="field-label" style={{ marginTop: 0 }}>Group name</label>
            <input
              className="input"
              value={editGroupName}
              onChange={(e) => setEditGroupName(e.target.value)}
              style={{ marginBottom: 12 }}
              placeholder="Group name"
            />

            <label className="field-label" style={{ marginTop: 0 }}>Members</label>
            <input
              className="input"
              placeholder="Search people…"
              value={editGroupSearch}
              onChange={(e) => setEditGroupSearch(e.target.value)}
              style={{ marginBottom: 10 }}
            />

            <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: 12 }}>
              {editGroupPeople.length === 0 && <p className="muted" style={{ fontSize: 12.5 }}>No people found.</p>}
              {editGroupPeople.map((person) => {
                const isSelf = person.id === user?.id;
                return (
                  <label key={person.id} style={contactRow}>
                    <input
                      type="checkbox"
                      checked={editSelection.includes(person.id)}
                      onChange={() => toggleEditMember(person.id)}
                    />
                    <ChatAvatar
                      name={person.full_name}
                      email={person.email}
                      avatarUrl={person.avatar_url}
                      size={32}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                        {person.full_name || person.email}
                        {isSelf ? " (you)" : ""}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>{person.email}</div>
                    </span>
                  </label>
                );
              })}
            </div>

            <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>
              {editSelection.length} selected
            </p>

            <button
              className="btn"
              style={{ width: "100%" }}
              onClick={saveEditGroup}
              disabled={savingGroup || editSelection.length < 2 || !editGroupName.trim()}
            >
              {savingGroup ? "Saving…" : "Save changes"}
            </button>
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
          <MediaFileLink
            url={previewImage}
            style={imagePreviewDownloadBtn}
            onClick={(e) => e.stopPropagation()}
            aria-label="Open original"
          >
            <i className="bi bi-download" />
          </MediaFileLink>
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
  background: "var(--brand-fill)",
  color: "var(--on-brand)",
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
const menuBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 20,
};
const chatMenu: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: 6,
  minWidth: 160,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
  padding: 6,
  zIndex: 30,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};
const chatMenuItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  border: "none",
  background: "transparent",
  padding: "10px 12px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text)",
  cursor: "pointer",
  textAlign: "left",
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
const systemMsgRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  margin: "10px 0",
};
const systemMsgPill: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.35,
  color: "var(--text-muted)",
  background: "var(--panel-muted)",
  border: "1px solid var(--border)",
  borderRadius: 999,
  padding: "5px 12px",
  maxWidth: "90%",
  textAlign: "center",
};
const bubble: React.CSSProperties = {
  maxWidth: 380,
  padding: "10px 14px",
  borderRadius: 14,
  fontSize: 13.5,
  lineHeight: 1.4,
  wordBreak: "break-word",
  whiteSpace: "pre-wrap",
};
const bubbleOther: React.CSSProperties = {
  background: "var(--elevated)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderBottomLeftRadius: 4,
};
const bubbleOwn: React.CSSProperties = {
  background: "var(--brand-fill)",
  color: "var(--on-brand)",
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
  alignItems: "flex-end",
  padding: "14px 20px",
};
const composerInput: React.CSSProperties = {
  flex: 1,
  resize: "none",
  minHeight: 40,
  maxHeight: 120,
  overflowY: "auto",
  lineHeight: 1.4,
};
const composerShell: React.CSSProperties = {
  borderTop: "1px solid var(--border)",
  background: "var(--panel)",
};
const pendingStrip: React.CSSProperties = {
  padding: "12px 20px 0",
};
const pendingPreview: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 12,
  background: "var(--elevated)",
  border: "1px solid var(--border)",
};
const pendingThumb: React.CSSProperties = {
  width: 52,
  height: 52,
  objectFit: "cover",
  borderRadius: 8,
  display: "block",
  background: "var(--bg)",
  flexShrink: 0,
};
const pendingDocIcon: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 8,
  display: "grid",
  placeItems: "center",
  background: "var(--danger-soft, #fee2e2)",
  color: "var(--danger)",
  fontSize: 22,
  flexShrink: 0,
};
const pendingRemoveBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  minWidth: 32,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--bg)",
  color: "var(--text-muted)",
  border: "1px solid var(--border)",
};
const dropOverlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 25,
  background: "color-mix(in srgb, var(--brand-fill, #3673FC) 18%, transparent)",
  backdropFilter: "blur(2px)",
  display: "grid",
  placeItems: "center",
  pointerEvents: "none",
};
const dropOverlayCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  padding: "22px 28px",
  borderRadius: 16,
  background: "var(--panel)",
  border: "2px dashed var(--brand-fill, #3673FC)",
  color: "var(--text)",
  fontWeight: 600,
  fontSize: 14,
  boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
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
