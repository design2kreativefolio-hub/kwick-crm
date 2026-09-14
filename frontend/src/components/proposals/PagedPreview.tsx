"use client";

import { useEffect, useRef, useState } from "react";

import { ProposalContent } from "@/lib/proposalContent";
import { buildProposalHtml } from "@/lib/proposalDocumentHtml";

// True print-style pagination (real pages that fill up and overflow to the
// next one, running headers/footers, named @page rules) via Paged.js's
// standalone polyfill (public/proposal/paged.polyfill.js, copied from
// node_modules/pagedjs/dist — see that file's header for the pinned
// version). It's run inside an isolated iframe rather than imported into
// this page's own JS: the polyfill's print stylesheet has bare element
// selectors (h1, p, ul...) that would otherwise leak into the whole app the
// moment it's injected into the main document's <head>.
export function PagedPreview({ content }: { content: ProposalContent }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== "proposal-preview-error") return;
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
      // Editing a field rebuilds this whole srcdoc, which reloads the iframe
      // and would snap it back to the top. Carry the current scroll offset
      // into the new document and keep re-applying it (Paged.js repaginates
      // asynchronously, growing the page height over ~1-2s) until the user
      // scrolls/clicks or the settle window passes.
      let prevScroll = 0;
      try {
        prevScroll = iframe.contentWindow?.scrollY || 0;
      } catch {
        prevScroll = 0;
      }
      const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/proposal/preview.css">
<script>
  window.onerror = function (message, source, line, col) {
    parent.postMessage({ type: "proposal-preview-error", message: message + " (line " + line + ")" }, "*");
  };
  (function () {
    var y = ${prevScroll};
    if (!y) return;
    var stopped = false;
    ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (ev) {
      addEventListener(ev, function () { stopped = true; }, { passive: true, once: true });
    });
    var n = 0;
    var id = setInterval(function () {
      if (stopped) { clearInterval(id); return; }
      window.scrollTo(0, y);
      if (++n > 40) clearInterval(id);
    }, 50);
    addEventListener("DOMContentLoaded", function () { window.scrollTo(0, y); });
  })();
</script>
</head>
<body>
${buildProposalHtml(content)}
<script src="/proposal/paged.polyfill.js" onerror="parent.postMessage({type:'proposal-preview-error', message:'Failed to load the pagination script.'}, '*')"></script>
</body>
</html>`;
      iframe.srcdoc = doc;

      // Paged.js gives no explicit "done" signal we can hook without
      // scripting the Previewer directly (we're using its drop-in polyfill
      // instead — see the module comment above) — fall back to a timeout so
      // a genuine hang shows an error instead of a spinner forever.
      hangTimer = setTimeout(() => {
        setRendering((current) => {
          if (current) setError("Preview is taking unusually long — it may have failed silently. Try reloading the page.");
          return false;
        });
      }, 12000);
    }, 500);

    return () => {
      clearTimeout(debounceTimer);
      clearTimeout(hangTimer);
    };
  }, [content]);

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
        title="Proposal preview"
        className="paged-preview-frame"
        sandbox="allow-scripts allow-same-origin"
        onLoad={() => setRendering(false)}
      />
    </div>
  );
}
