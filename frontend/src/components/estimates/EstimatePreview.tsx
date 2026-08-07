"use client";

import { useEffect, useRef } from "react";

import { EstimateContent } from "@/lib/estimateContent";
import { buildEstimateHtml } from "@/lib/estimateDocumentHtml";

export function EstimatePreview({ content }: { content: EstimateContent }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      iframe.srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/estimate/preview.css">
</head>
<body>
<div class="estimate-sheet">
${buildEstimateHtml(content)}
</div>
</body>
</html>`;
    }, 250);
    return () => clearTimeout(timer);
  }, [content]);

  return (
    <div className="paged-preview-wrap">
      <iframe
        ref={iframeRef}
        title="Estimate preview"
        className="paged-preview-iframe"
        style={{ width: "100%", minHeight: 720, border: 0, background: "transparent" }}
      />
    </div>
  );
}
