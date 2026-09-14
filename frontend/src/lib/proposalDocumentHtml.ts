// Builds the same document structure as backend/sales/templates/sales/proposal_pdf.html
// as a plain HTML string, for Paged.js to paginate client-side in the live
// preview. Keep this in sync with that template — same section order, same
// class names (styled by public/proposal/preview.css, which mirrors the
// PDF's own <style> block) — so what you see in the editor matches the PDF.

import {
  ProposalContent,
  SOCIAL_PLATFORM_OPTIONS,
  customSectionKey,
  normalizeContentOrder,
  termsHtml,
} from "./proposalContent";

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

  // Every non-Home section (built-ins + custom) is emitted in the user's saved
  // drag order (content.content_order). `frag` holds each section's HTML keyed
  // by its order key; the cover is always first.
  const visiblePlatforms = content.social_medias.platforms.filter((p) => p.enabled);
  const frag: Record<string, string> = {
    about_kreativefolio: content.about_kreativefolio.enabled
      ? `<section class="${sectionClass(content.about_kreativefolio.page_break_before)}"><h2>${esc(
          content.about_kreativefolio.heading || "About Kreativefolio"
        )}</h2>${content.about_kreativefolio.content}</section>`
      : "",
    about_client: content.about_client.enabled
      ? `
      <section class="${sectionClass(content.about_client.page_break_before)}">
        <h2>${esc(content.about_client.heading || "About the Client")}</h2>
        ${content.about_client.content}
        ${imgs(content.about_client.image_urls, "section-image")}
      </section>
    `
      : "",
    traffic: content.traffic.enabled
      ? `
      <section class="${sectionClass(content.traffic.page_break_before)}">
        <h2>${esc(content.traffic.heading || "Traffic")}</h2>
        ${imgs(content.traffic.image_urls, "section-image-full")}
      </section>
    `
      : "",
    technical_seo: content.technical_seo.enabled
      ? `<section class="${sectionClass(content.technical_seo.page_break_before)}"><h2>${esc(
          content.technical_seo.heading || "Technical SEO"
        )}</h2>${content.technical_seo.content}</section>`
      : "",
    keyword_strategy: content.keyword_strategy.enabled
      ? `
      <section class="${sectionClass(content.keyword_strategy.page_break_before)}">
        <h2>${esc(content.keyword_strategy.heading || "Keyword Strategy")}</h2>
        ${imgs(content.keyword_strategy.image_urls, "section-image-full")}
      </section>
    `
      : "",
    onpage_seo: content.onpage_seo.enabled
      ? `
      <section class="${sectionClass(content.onpage_seo.page_break_before)}">
        <h2>${esc(content.onpage_seo.heading || "Onpage SEO")}</h2>
        ${content.onpage_seo.content}
        ${imgs(content.onpage_seo.image_urls, "section-image")}
      </section>
    `
      : "",
    geo: content.geo.enabled
      ? `
      <section class="${sectionClass(content.geo.page_break_before)}">
        <h2>${esc(content.geo.heading || "GEO")}</h2>
        ${fieldBox(content.geo.description_label || "Description", content.geo.description)}
        <h3>${esc(content.geo.recommendations_label || "Recommendations")}</h3>
        ${content.geo.recommendations}
        <h3>${esc(content.geo.approach_label || "Our Approach")}</h3>
        ${content.geo.approach}
      </section>
    `
      : "",
    social_medias:
      content.social_medias.enabled && visiblePlatforms.length > 0
        ? `<section class="${sectionClass(content.social_medias.page_break_before)}"><h2>${esc(
            content.social_medias.heading || "Social Medias"
          )}</h2>${visiblePlatforms
            .map((p) => {
              const label = SOCIAL_PLATFORM_OPTIONS.find((o) => o.value === p.platform)?.label || p.platform;
              return `
          <div class="${sectionClass(p.page_break_before, "platform-block")}">
            <h3>${esc(p.heading || label)}</h3>
            ${fieldBox(p.description_label || "Description", p.description)}
            ${imgs(p.image_urls, "section-image")}
            ${
              p.key_problems
                ? `<h3 style="font-size:12.5px;">${esc(p.key_problems_label || "Key Problems Identified")}</h3>${p.key_problems}`
                : ""
            }
            ${table(
              [p.col_category || "Category", p.col_details || "Details", p.col_goal || "Goal"],
              p.strategy_rows as unknown as Record<string, string>[],
              ["category", "details", "goal"]
            )}
          </div>
        `;
            })
            .join("")}</section>`
        : "",
    what_we_can_do:
      content.what_we_can_do.enabled && content.what_we_can_do.rows.length > 0
        ? `
      <section class="${sectionClass(content.what_we_can_do.page_break_before)}">
        <h2>${esc(content.what_we_can_do.heading || "What We Can Do")}</h2>
        ${table(
          [content.what_we_can_do.col_area || "Area", content.what_we_can_do.col_details || "How Kreativefolio Can Help"],
          content.what_we_can_do.rows as unknown as Record<string, string>[],
          ["area", "details"]
        )}
      </section>
    `
        : "",
  };

  const visiblePricing = content.pricing.filter((p) => p.enabled);
  frag.pricing =
    visiblePricing.length > 0
      ? `<section class="doc-section"><h2>${esc(content.pricing_heading || "Pricing")}</h2>${visiblePricing
          .map(
            (item) => `
          <div class="${sectionClass(item.page_break_before, "pricing-block")}">
            <h3>${esc(item.service_name || "Service")}</h3>
            ${fieldBox(item.ad_budget_label || "Ad Budget", item.ad_budget)}
            ${fieldBox(item.management_fee_label || "Ad Management Fee", item.management_fee)}
            ${table(
              [item.col_category || "Category", item.col_details || "Details", item.col_frequency || "Frequency"],
              item.rows as unknown as Record<string, string>[],
              ["category", "details", "frequency"]
            )}
          </div>
        `
          )
          .join("")}</section>`
      : "";

  frag.terms = content.terms.enabled
    ? `<section class="${sectionClass(content.terms.page_break_before)}"><h2>${esc(
        content.terms.heading || "Terms"
      )}</h2>${termsHtml(content.terms)}</section>`
    : "";

  frag.full_page_image =
    content.full_page_image.enabled && content.full_page_image.image_url
      ? `<section class="fullbleed-page" style="background-image: url('${esc(
          content.full_page_image.image_url
        )}');"></section>`
      : "";

  for (const item of content.custom_sections || []) {
    const hasBody = Boolean(item.content?.trim()) || (item.image_urls && item.image_urls.length > 0);
    frag[customSectionKey(item.id)] =
      item.enabled && (hasBody || item.title?.trim())
        ? `
      <section class="${sectionClass(item.page_break_before)}">
        <h2>${esc(item.title || "Additional section")}</h2>
        ${item.content || ""}
        ${imgs(item.image_urls || [], "section-image")}
      </section>
    `
        : "";
  }

  const order = normalizeContentOrder(
    content.content_order,
    (content.custom_sections || []).map((s) => s.id)
  );
  for (const key of order) {
    if (frag[key]) parts.push(frag[key]);
  }

  return parts.join("\n");
}
