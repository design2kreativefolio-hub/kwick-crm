import { InvoiceContent, invoiceDocLabel, invoiceSubtotal, lineAmount } from "./invoiceContent";

function esc(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y) return esc(iso);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function money(n: number): string {
  return n.toFixed(2);
}

function detailsList(details: string): string {
  const lines = details
    .split("\n")
    .map((ln) => ln.trim().replace(/^[•\-]\s*/, ""))
    .filter(Boolean);
  if (!lines.length) return "";
  return `<ul class="item-details">${lines.map((ln) => `<li>${esc(ln)}</li>`).join("")}</ul>`;
}

/** Details block for one line item — omitted when the item's "Show details"
 *  toggle is off. Renders rich-text HTML from the editor as-is; falls back to
 *  the legacy newline-bullet format for older invoices stored as plain text. */
function detailsBlock(item: { details: string; show_details?: boolean }): string {
  if (item.show_details === false) return "";
  const d = (item.details || "").trim();
  if (!d) return "";
  if (/<[a-z!/][\s\S]*>/i.test(d)) {
    const plain = d.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    return plain ? `<div class="item-details">${d}</div>` : "";
  }
  return detailsList(d);
}

export function buildInvoiceHtml(content: InvoiceContent): string {
  const currency = content.currency || "AED";
  const total = invoiceSubtotal(content.items);
  const dateDisplay = formatDate(content.date);
  const dueDisplay = formatDate(content.due_date);
  const kind = content.invoice_kind || "standard";
  const label = content.doc_heading?.trim() || invoiceDocLabel(kind);
  const smallLabel = label.length > 9;
  const isPetty = kind === "petty_cash";

  const rows = content.items
    .map((item, i) => {
      const amount = lineAmount(item);
      const qtyBlank = item.qty === null || item.qty === undefined || (item.qty as unknown) === "";
      return `<tr>
        <td class="idx">${i + 1}</td>
        <td>
          <div class="item-desc">${esc(item.description) || "—"}</div>
          ${detailsBlock(item)}
        </td>
        <td class="num">${qtyBlank ? "" : money(Number(item.qty) || 0)}</td>
        <td class="num">${esc(currency)} ${money(Number(item.rate) || 0)}</td>
        <td class="num">${esc(currency)} ${money(amount)}</td>
      </tr>`;
    })
    .join("");

  const descPlain = (content.payment_details || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  const footerBlock = isPetty
    ? `<div class="footer-block">
          <h3>Authorization</h3>
          <p class="pay-row"><strong>Received by:</strong> ${esc(content.received_by) || "—"}</p>
          <p class="pay-row"><strong>Passed by:</strong> ${esc(content.passed_by) || "—"}</p>
        </div>`
    : descPlain
    ? `<div class="footer-block">
          <h3>${esc(content.payment_heading) || "Payment Details"}</h3>
          <div class="notes-text">${content.payment_details}</div>
        </div>`
    : "";

  return `
  <table class="layout">
    <tr>
      <td style="width:62%;">
        <img class="brand-logo" src="/proposal/logo.png" alt="Kreativefolio" />
        <p class="brand-name">Kreativefolio</p>
        <p class="brand-meta">
          Office No: M12, Arabilla Building - Block D, Hor Al Anz East - Deira Dubai 123357, U.A.E.<br />
          Phone: 971-46657618<br />
          Email: info@kreativefolio.com<br />
          Website: www.kreativefolio.com
        </p>
      </td>
      <td class="doc-side">
        <p class="doc-label${smallLabel ? " doc-label-sm" : ""}">${esc(label)}</p>
        <p class="doc-number"># ${esc(content.invoice_number) || "—"}</p>
      </td>
    </tr>
  </table>
  <div class="section-gap"></div>
  <table class="layout">
    <tr>
      <td>
        <p class="bill-to-label">Bill To</p>
        <p class="bill-to-name">${esc(content.bill_to) || "—"}</p>
        ${content.bill_to_email ? `<p class="bill-to-email">${esc(content.bill_to_email)}</p>` : ""}
      </td>
      <td class="dates">
        <div class="row"><span class="label">Invoice Date :</span> ${esc(dateDisplay)}</div>
        ${isPetty ? "" : `<div class="row"><span class="label">Due Date :</span> ${esc(dueDisplay)}</div>`}
      </td>
    </tr>
  </table>
  <div class="section-gap"></div>
  <table class="items">
    <thead>
      <tr>
        <th class="idx">#</th>
        <th>${esc(content.items_heading) || "Item &amp; Description"}</th>
        <th class="num">Qty</th>
        <th class="num">Rate</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="5" style="text-align:center;color:#8a8f9e;">No items</td></tr>`}
    </tbody>
  </table>
  <table class="totals">
    <tr><td>Sub Total</td><td class="r">${esc(currency)} ${money(total)}</td></tr>
    <tr class="total"><td>Total</td><td class="r">${esc(currency)} ${money(total)}</td></tr>
  </table>
  <table class="bottom-grid">
    <tr>
      <td>
        ${footerBlock}
        ${
          content.notes
            ? `<div class="footer-block" style="margin-top:16px;"><h3>${esc(content.notes_heading) || "Notes"}</h3><p class="notes-text">${esc(content.notes)}</p></div>`
            : ""
        }
      </td>
      <td></td>
    </tr>
  </table>
  <p class="disclaimer">This is a system-generated ${esc(label.toLowerCase())} and does not require a signature.</p>
  <div class="powered-by">Powered By Kreativefolio</div>
  `;
}
