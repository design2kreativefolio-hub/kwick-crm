// Builds HTML matching backend/sales/templates/sales/estimate_pdf.html for the live preview.

import {
  EstimateContent,
  estimateSubtotal,
  lineAmount,
} from "./estimateContent";

function esc(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
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

function termsList(terms: string): string {
  const lines = terms
    .split("\n")
    .map((ln) => ln.trim())
    .filter(Boolean)
    .map((ln) => ln.replace(/^\d+[.)]\s*/, ""));
  if (!lines.length) return "";
  return `<ol>${lines.map((ln) => `<li>${esc(ln)}</li>`).join("")}</ol>`;
}

export function buildEstimateHtml(content: EstimateContent): string {
  const currency = content.currency || "AED";
  const total = estimateSubtotal(content.items);
  const dateDisplay = formatDate(content.date) || formatDate(new Date().toISOString().slice(0, 10));
  const expiryDisplay = formatDate(content.expiry_date);

  const rows = content.items
    .map((item, i) => {
      const amount = lineAmount(item);
      return `<tr>
        <td class="idx">${i + 1}</td>
        <td>
          <div class="item-desc">${esc(item.description) || "—"}</div>
          ${detailsList(item.details)}
        </td>
        <td class="num">${money(Number(item.qty) || 0)}</td>
        <td class="num">${money(Number(item.rate) || 0)}</td>
        <td class="num">${money(amount)}</td>
      </tr>`;
    })
    .join("");

  return `
  <table class="layout">
    <tr>
      <td style="width:62%;">
        <img class="brand-logo" src="/proposal/logo.png" alt="Kreativefolio" />
        <p class="brand-name">Kreative Folio Marketing Management L.L.C</p>
        <p class="brand-meta">
          Office No: M12, Arabilla Building - Block D, Hor Al Anz East - Deira Dubai 123357, U.A.E.<br />
          Phone: 971-46657618<br />
          Email: info@kreativefolio.com<br />
          Website: www.kreativefolio.com
        </p>
      </td>
      <td class="quote-side">
        <p class="quote-label">QUOTE</p>
        <p class="quote-number"># ${esc(content.quote_number) || "—"}</p>
      </td>
    </tr>
  </table>
  <div class="section-gap"></div>
  <table class="layout">
    <tr>
      <td>
        <p class="bill-to-label">Bill To</p>
        <p class="bill-to-name">${esc(content.bill_to) || "—"}</p>
      </td>
      <td class="dates">
        <div>${esc(dateDisplay)}</div>
        ${expiryDisplay ? `<div class="expiry"><span>Expiry Date</span> &nbsp; ${esc(expiryDisplay)}</div>` : ""}
      </td>
    </tr>
  </table>
  <div class="section-gap"></div>
  <table class="items">
    <thead>
      <tr>
        <th class="idx">#</th>
        <th>Item &amp; Description</th>
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
    <tr><td>Sub Total</td><td class="r">${money(total)}</td></tr>
    <tr class="total"><td>Total</td><td class="r">${esc(currency)}${money(total)}</td></tr>
  </table>
  ${
    content.notes
      ? `<div class="footer-block"><h3>Notes</h3><p>${esc(content.notes)}</p></div>`
      : ""
  }
  ${
    content.terms
      ? `<div class="footer-block" style="margin-top:16px;"><h3>Terms &amp; Conditions</h3>${termsList(content.terms)}</div>`
      : ""
  }
  <div class="powered-by">Powered By Kwick</div>
  `;
}
