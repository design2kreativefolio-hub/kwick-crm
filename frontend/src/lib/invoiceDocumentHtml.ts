import { InvoiceContent, invoiceSubtotal, lineAmount } from "./invoiceContent";

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

export function buildInvoiceHtml(content: InvoiceContent): string {
  const currency = content.currency || "AED";
  const total = invoiceSubtotal(content.items);
  const dateDisplay = formatDate(content.date);
  const dueDisplay = formatDate(content.due_date);
  const payment = content.payment;

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
        <td class="num">${esc(currency)} ${money(Number(item.rate) || 0)}</td>
        <td class="num">${esc(currency)} ${money(amount)}</td>
      </tr>`;
    })
    .join("");

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
        <p class="doc-label">INVOICE</p>
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
        <div class="row"><span class="label">Due Date :</span> ${esc(dueDisplay)}</div>
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
    <tr><td>Sub Total</td><td class="r">${esc(currency)} ${money(total)}</td></tr>
    <tr class="total"><td>Total</td><td class="r">${esc(currency)} ${money(total)}</td></tr>
  </table>
  <table class="bottom-grid">
    <tr>
      <td>
        <div class="footer-block">
          <h3>Payment Details</h3>
          <p class="pay-row"><strong>Payment Method:</strong> ${esc(payment.payment_method) || "—"}</p>
          <p class="pay-row"><strong>Bank Name:</strong> ${esc(payment.bank_name) || "—"}</p>
          <p class="pay-row"><strong>Account Name:</strong> ${esc(payment.account_name) || "—"}</p>
          <p class="pay-row"><strong>IBAN / Account Number:</strong> ${esc(payment.iban) || "—"}</p>
          <p class="pay-row"><strong>Paid Amount:</strong> ${esc(payment.paid_amount) || "—"}</p>
        </div>
        ${
          content.notes
            ? `<div class="footer-block" style="margin-top:16px;"><h3>Notes</h3><p class="notes-text">${esc(content.notes)}</p></div>`
            : ""
        }
      </td>
      <td></td>
    </tr>
  </table>
  <p class="disclaimer">This is a system-generated invoice and does not require a signature.</p>
  <div class="powered-by">Powered By Kwick</div>
  `;
}
