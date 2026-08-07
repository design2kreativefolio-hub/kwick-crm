// Builds the same document structure as backend/sales/templates/sales/proposal_pdf.html
// as a plain HTML string, for Paged.js to paginate client-side in the live
// preview. Keep this in sync with that template — same section order, same
// class names (styled by public/proposal/preview.css, which mirrors the
// PDF's own <style> block) — so what you see in the editor matches the PDF.

import { ProposalContent, SOCIAL_PLATFORM_OPTIONS, termsHtml } from "./proposalContent";

function esc(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape cell text and turn newlines into <br> so pricing/strategy bullets
 *  stack one-per-line in the preview (plain HTML collapses \n to spaces). */
function cellHtml(value: string | null | undefined): string {
  return esc(value).replace(/\r\n|\r|\n/g, "<br>");
}

function formatDate(iso: string | null): string {
  if (!iso) return new Date().toLocaleDateString("en-GB");
  const [y, m, d] = iso.split("-").map(Number);
  if (!y) return esc(iso);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB");
}

function table(headers: string[], rows: Record<string, string>[], keys: string[]): string {
  if (rows.length === 0) return "";
  const head = `<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>`;
  const body = rows
    .map((row) => `<tr>${keys.map((k) => `<td>${cellHtml(row[k])}</td>`).join("")}</tr>`)
    .join("");
  return `<table class="doc-table">${head}<tbody>${body}</tbody></table>`;
}

function fieldBox(label: string, text: string): string {
  if (!text) return "";
  return `<div class="field-form"><span class="label">${esc(label)}</span>${esc(text)}</div>`;
}

function imgs(urls: string[], cls: string): string {
  return urls.map((u) => `<img class="${cls}" src="${esc(u)}" />`).join("");
}

function sectionClass(pageBreakBefore?: boolean, extra = "doc-section"): string {
  return `${extra}${pageBreakBefore ? " page-break-before" : ""}`;
}

export function buildProposalHtml(content: ProposalContent): string {
  const home = content.home;
  const clientDisplayName = home.client_name || "Client";
  const parts: string[] = [];

  if (home.enabled) {
    parts.push(`
      <section class="cover-page">
        <div class="cover-logo-row"><img class="cover-logo" src="/proposal/logo.png" /></div>
        <div class="qtn-box-wrap">
          <table class="qtn-box"><tbody>
            <tr><td>QTN No:</td><td>${esc(home.qtn_no)}</td></tr>
            <tr><td>Date:</td><td>${formatDate(home.date)}</td></tr>
          </tbody></table>
        </div>
        <h1 class="cover-title">${esc(home.title)}</h1>
        <div class="cover-client">
          <p>To: <strong>${esc(clientDisplayName)}</strong></p>
          ${home.client_email ? `<p>Email: ${esc(home.client_email)}</p>` : ""}
          ${home.client_phone ? `<p>Contact No: ${esc(home.client_phone)}</p>` : ""}
        </div>
      </section>
    `);
  }

  if (content.about_kreativefolio.enabled) {
    parts.push(
      `<section class="${sectionClass(content.about_kreativefolio.page_break_before)}"><h2>About Kreativefolio</h2>${content.about_kreativefolio.content}</section>`
    );
  }

  if (content.about_client.enabled) {
    parts.push(`
      <section class="${sectionClass(content.about_client.page_break_before)}">
        <h2>About ${esc(clientDisplayName)}</h2>
        ${content.about_client.content}
        ${imgs(content.about_client.image_urls, "section-image")}
      </section>
    `);
  }

  if (content.traffic.enabled) {
    parts.push(`
      <section class="${sectionClass(content.traffic.page_break_before)}">
        <h2>Traffic</h2>
        ${imgs(content.traffic.image_urls, "section-image-full")}
      </section>
    `);
  }

  if (content.technical_seo.enabled) {
    parts.push(
      `<section class="${sectionClass(content.technical_seo.page_break_before)}"><h2>Technical SEO</h2>${content.technical_seo.content}</section>`
    );
  }

  if (content.keyword_strategy.enabled) {
    parts.push(`
      <section class="${sectionClass(content.keyword_strategy.page_break_before)}">
        <h2>Keyword Strategy</h2>
        ${imgs(content.keyword_strategy.image_urls, "section-image-full")}
      </section>
    `);
  }

  if (content.onpage_seo.enabled) {
    parts.push(`
      <section class="${sectionClass(content.onpage_seo.page_break_before)}">
        <h2>Onpage SEO</h2>
        ${content.onpage_seo.content}
        ${imgs(content.onpage_seo.image_urls, "section-image")}
      </section>
    `);
  }

  if (content.geo.enabled) {
    parts.push(`
      <section class="${sectionClass(content.geo.page_break_before)}">
        <h2>GEO</h2>
        ${fieldBox("Description", content.geo.description)}
        <h3>Recommendations</h3>
        ${content.geo.recommendations}
        <h3>Our Approach</h3>
        ${content.geo.approach}
      </section>
    `);
  }

  const visiblePlatforms = content.social_medias.platforms.filter((p) => p.enabled);
  if (content.social_medias.enabled && visiblePlatforms.length > 0) {
    const blocks = visiblePlatforms
      .map((p) => {
        const label = SOCIAL_PLATFORM_OPTIONS.find((o) => o.value === p.platform)?.label || p.platform;
        return `
          <div class="${sectionClass(p.page_break_before, "platform-block")}">
            <h3>${esc(label)}</h3>
            ${fieldBox("Description", p.description)}
            ${imgs(p.image_urls, "section-image")}
            ${p.key_problems ? `<h3 style="font-size:12.5px;">Key Problems Identified</h3>${p.key_problems}` : ""}
            ${table(["Category", "Details", "Goal"], p.strategy_rows as unknown as Record<string, string>[], ["category", "details", "goal"])}
          </div>
        `;
      })
      .join("");
    parts.push(
      `<section class="${sectionClass(content.social_medias.page_break_before)}"><h2>Social Medias</h2>${blocks}</section>`
    );
  }

  if (content.what_we_can_do.enabled && content.what_we_can_do.rows.length > 0) {
    parts.push(`
      <section class="${sectionClass(content.what_we_can_do.page_break_before)}">
        <h2>What We Can Do</h2>
        ${table(["Area", "How Kreativefolio Can Help"], content.what_we_can_do.rows as unknown as Record<string, string>[], ["area", "details"])}
      </section>
    `);
  }

  const visiblePricing = content.pricing.filter((p) => p.enabled);
  if (visiblePricing.length > 0) {
    const blocks = visiblePricing
      .map(
        (item) => `
          <div class="${sectionClass(item.page_break_before, "pricing-block")}">
            <h3>${esc(item.service_name || "Service")}</h3>
            ${fieldBox(item.ad_budget_label || "Ad Budget", item.ad_budget)}
            ${fieldBox(item.management_fee_label || "Ad Management Fee", item.management_fee)}
            ${table(["Category", "Details", "Frequency"], item.rows as unknown as Record<string, string>[], ["category", "details", "frequency"])}
          </div>
        `
      )
      .join("");
    parts.push(`<section class="doc-section"><h2>Pricing</h2>${blocks}</section>`);
  }

  if (content.terms.enabled) {
    parts.push(
      `<section class="${sectionClass(content.terms.page_break_before)}"><h2>Terms</h2>${termsHtml(content.terms)}</section>`
    );
  }

  if (content.full_page_image.enabled && content.full_page_image.image_url) {
    parts.push(`
      <section class="fullbleed-page" style="background-image: url('${esc(content.full_page_image.image_url)}');"></section>
    `);
  }

  return parts.join("\n");
}
