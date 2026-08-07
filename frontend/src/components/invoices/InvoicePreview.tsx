"use client";

import { useEffect, useRef } from "react";

import { InvoiceContent } from "@/lib/invoiceContent";
import { buildInvoiceHtml } from "@/lib/invoiceDocumentHtml";

export function InvoicePreview({ content }: { content: InvoiceContent }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      iframe.srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/invoice/preview.css">
</head>
<body>
<div class="invoice-sheet">
${buildInvoiceHtml(content)}
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
        title="Invoice preview"
        className="paged-preview-iframe"
        style={{ width: "100%", minHeight: 720, border: 0, background: "transparent" }}
      />
    </div>
  );
}
