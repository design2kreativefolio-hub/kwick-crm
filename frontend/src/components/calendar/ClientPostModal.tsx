"use client";

import { useEffect, useRef, useState } from "react";

import { MediaFileLink } from "@/components/MediaFileLink";
import { Modal } from "@/components/Modal";
import { api, ApiError, formatApiError } from "@/lib/api";
import { displayUploadedFileName } from "@/lib/files";

type Comment = { id: number; from_client: boolean; author_name: string; body: string; created_at: string };

export type ClientPostItem = {
  id: number;
  title: string;
  status: string;
  client_post_files: string[];
  client_post_caption: string;
};

/** Upload the final post the client will see, and read / reply to their comments. */
export function ClientPostModal({
  item,
  onClose,
  onChanged,
}: {
  item: ClientPostItem | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [existing, setExisting] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reply, setReply] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const itemId = item?.id ?? null;
  useEffect(() => {
    if (!item) return;
    setFiles([]);
    setError(null);
    setReply("");
    setCaption(item.client_post_caption || "");
    setExisting(item.client_post_files || []);
    api<Comment[]>(`/api/projects/content-calendar/${item.id}/comments`)
      .then(setComments)
      .catch(() => setComments([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  if (!item) return <Modal open={false} onClose={onClose}>{null}</Modal>;

  const fail = (err: unknown) => setError(err instanceof ApiError ? formatApiError(err.data) : "Something went wrong.");

  const upload = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      files.forEach((f) => body.append("files", f));
      body.append("caption", caption);
      const updated = await api<ClientPostItem>(`/api/projects/content-calendar/${item.id}/client-post`, {
        method: "POST",
        body,
      });
      setExisting(updated.client_post_files || []);
      setFiles([]);
      onChanged();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const removeFile = async (index: number) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api<ClientPostItem>(
        `/api/projects/content-calendar/${item.id}/client-post?index=${index}`,
        { method: "DELETE" }
      );
      setExisting(updated.client_post_files || []);
      if (!(updated.client_post_files || []).length) setCaption("");
      onChanged();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    try {
      setComments(
        await api<Comment[]>(`/api/projects/content-calendar/${item.id}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: reply }),
        })
      );
      setReply("");
      onChanged();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <Modal open onClose={onClose} maxWidth={560}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="card-title" style={{ margin: 0 }}>
          Client post — {item.title}
        </span>
        <button type="button" className="icon-btn-anim" onClick={onClose} aria-label="Close" style={closeBtn}>
          <i className="bi bi-x-lg" />
        </button>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: "8px 0 14px" }}>
        Files uploaded here are visible only to the client, through their shared calendar link.
      </p>

      {existing.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          {existing.map((url, i) => (
            <div key={url} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MediaFileLink url={url} style={{ flex: 1, fontSize: 13, color: "var(--gold)", minWidth: 0 }}>
                <i className="bi bi-paperclip" /> {displayUploadedFileName(url)}
              </MediaFileLink>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--danger)" }}
                disabled={busy}
                onClick={() => removeFile(i)}
                aria-label="Remove file"
              >
                <i className="bi bi-trash-fill" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/mp4,video/quicktime,video/webm,application/pdf"
        style={{ display: "none" }}
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
      />
      <button type="button" className="btn btn-ghost" onClick={() => inputRef.current?.click()}>
        <i className="bi bi-upload" /> {files.length ? `${files.length} file(s) selected` : "Choose files"}
      </button>
      <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
        Images, video or PDF · 30MB each
      </span>

      <textarea
        className="input"
        rows={3}
        placeholder="Caption for the client (optional)"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        style={{ marginTop: 12 }}
      />

      {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: "10px 0 0" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="btn"
          disabled={busy || (!files.length && caption === (item.client_post_caption || ""))}
          onClick={upload}
        >
          {busy ? "Uploading…" : existing.length || files.length ? "Save post" : "Upload post"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <span className="muted" style={{ fontSize: 12 }}>Client comments</span>
        {comments.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, margin: "6px 0" }}>No comments yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, margin: "8px 0", maxHeight: 200, overflowY: "auto" }}>
            {comments.map((c) => (
              <div key={c.id} style={{ fontSize: 13 }}>
                <strong>{c.author_name}</strong>
                {c.from_client ? <span className="badge badge-muted" style={{ marginLeft: 6 }}>Client</span> : null}
                <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                  {new Date(c.created_at).toLocaleString()}
                </span>
                <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            placeholder="Reply to the client…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void sendReply();
              }
            }}
          />
          <button type="button" className="btn" onClick={sendReply} disabled={!reply.trim()}>
            Reply
          </button>
        </div>
      </div>
    </Modal>
  );
}

const closeBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--bg)",
  border: "none",
  color: "var(--text-muted)",
};
