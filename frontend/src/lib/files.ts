/** Human-readable name for an uploaded file URL. */
export function displayUploadedFileName(url: string) {
  if (!url || typeof url !== "string") return "";
  try {
    const parsed = new URL(url, "http://localhost");
    const named = parsed.searchParams.get("name");
    if (named && named.trim()) return named.trim();
    const raw = decodeURIComponent(parsed.pathname.split("/").pop() || "File");
    const prefixed = raw.match(/^[a-f0-9]{8}_(.+)$/i);
    if (prefixed) return prefixed[1];
    if (/^[a-f0-9]{32}\.[a-z0-9]+$/i.test(raw)) {
      const ext = raw.split(".").pop();
      return ext ? `Uploaded file.${ext}` : "Uploaded file";
    }
    return raw;
  } catch {
    return "Attachment";
  }
}

/**
 * Open a CRM file in a new tab. Always sends login cookies.
 * A copied /media/ link without a session is rejected by the API (401).
 */
export async function openUploadedFile(url: string) {
  if (!url) return;
  const name = displayUploadedFileName(url) || "file";
  try {
    const res = await fetch(url, { credentials: "include" });
    if (res.status === 401 || res.status === 403) return;
    if (!res.ok) throw new Error("open failed");
    const blob = await res.blob();
    const type = blob.type || "application/octet-stream";
    const file = new File([blob], name, { type });
    const obj = URL.createObjectURL(file);
    const opened = window.open(obj, "_blank", "noopener,noreferrer");
    if (!opened) {
      const a = document.createElement("a");
      a.href = obj;
      a.download = name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(obj), 60_000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
