"use client";

import { useEffect, useRef, useState } from "react";

import { DocType, LetterContent } from "@/lib/hrLetterContent";
import { buildLetterHtml } from "@/lib/hrLetterDocumentHtml";

/** Letter live preview with real A4 pagination (Paged.js), matching PDF. */
export function LetterPreview({
  docType,
  content,
  documentTitle,
}: {
  docType: DocType;
  content: LetterContent;
  documentTitle?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== "letter-preview-error") return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      setError(e.data.message || "Unknown error");
      setRendering(false);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    setRendering(true);
    setError(null);
    let hangTimer: ReturnType<typeof setTimeout> | undefined;

    const debounceTimer = setTimeout(() => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      iframe.srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/hr/preview.css">
<script>
  window.onerror = function (message, source, line) {
    parent.postMessage({ type: "letter-preview-error", message: message + " (line " + line + ")" }, "*");
  };
</script>
</head>
<body>
${buildLetterHtml(docType, content, documentTitle)}
<script src="/proposal/paged.polyfill.js" onerror="parent.postMessage({type:'letter-preview-error', message:'Failed to load the pagination script.'}, '*')"></script>
</body>
</html>`;

      hangTimer = setTimeout(() => {
        setRendering((current) => {
          if (current) {
            setError("Preview is taking unusually long — try reloading the page.");
          }
          return false;
        });
      }, 12000);
    }, 400);

    return () => {
      clearTimeout(debounceTimer);
      clearTimeout(hangTimer);
    };
  }, [docType, content, documentTitle]);

  return (
    <div className="paged-preview-wrap">
      {rendering && <div className="paged-preview-loading">Updating preview…</div>}
      {error && (
        <div className="paged-preview-error">
          <i className="bi bi-exclamation-triangle-fill" /> Preview failed: {error}
        </div>
      )}
      <iframe
        ref={iframeRef}
        title="Letter preview"
        className="paged-preview-frame"
        sandbox="allow-scripts allow-same-origin"
        onLoad={() => setRendering(false)}
      />
    </div>
  );
}
