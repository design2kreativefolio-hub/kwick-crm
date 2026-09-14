/** Open the user's email client with a compose draft and download the PDF for attaching.
 *  Browsers cannot auto-attach files to mailto:, so we download the PDF and open a draft.
 */
import { openUploadedFile } from "./files";

export type SendDocumentEmailArgs = {
  /** Absolute or same-origin URL to the PDF */
  pdfUrl: string;
  /** Optional prefilled recipient */
  to?: string | null;
  subject: string;
  body?: string;
  filename?: string;
};

function triggerDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename || "document.pdf";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

function openMailto(to: string, subject: string, body: string) {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const qs = params.toString();
  const href = `mailto:${encodeURIComponent(to.trim())}${qs ? `?${qs}` : ""}`;
  window.location.href = href;
}

export async function sendDocumentViaEmail(args: SendDocumentEmailArgs): Promise<{ mode: "share" | "mailto" }> {
  const to = (args.to || "").trim();
  const subject = args.subject || "Document";
  const body =
    args.body ||
    "Please find the attached PDF.\n\n(If the file is not attached automatically, attach the downloaded PDF before sending.)";
  const filename = args.filename || "document.pdf";

  let blob: Blob | null = null;
  try {
    const res = await fetch(args.pdfUrl, { mode: "cors", credentials: "include" });
    if (res.ok) blob = await res.blob();
  } catch {
    blob = null;
  }

  if (blob) {
    const file = new File([blob], filename, { type: "application/pdf" });
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
    };
    if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: subject, text: body });
        return { mode: "share" };
      } catch (err: any) {
        // User cancelled share — still fall through to mailto/download.
        if (err?.name === "AbortError") {
          triggerDownload(blob, filename);
          if (to) openMailto(to, subject, body);
          return { mode: "mailto" };
        }
      }
    }
    triggerDownload(blob, filename);
  } else {
    // CORS blocked — open PDF so the user can save it, then compose email.
    void openUploadedFile(args.pdfUrl);
  }

  if (to) openMailto(to, subject, body);
  else openMailto("", subject, body);

  return { mode: "mailto" };
}
