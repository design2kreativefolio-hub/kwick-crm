/** Human-readable name for an uploaded file URL. */
export function displayUploadedFileName(url: string) {
  if (!url || typeof url !== "string") return "";
  try {
    const raw = decodeURIComponent((url.split("/").pop() || "File").split("?")[0]);
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
