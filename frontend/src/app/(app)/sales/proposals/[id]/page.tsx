"use client";

import { useEffect, useMemo, useState } from "react";

import { useParams } from "next/navigation";

import { BackLink } from "@/components/BackLink";
import { DatePicker } from "@/components/DatePicker";
import { DocNameField } from "@/components/DocNameField";
import { Select } from "@/components/Select";
import { EditableTable } from "@/components/proposals/EditableTable";
import { ImageGalleryField } from "@/components/proposals/ImageGalleryField";
import { ImageUploadField } from "@/components/proposals/ImageUploadField";
import { PagedPreview } from "@/components/proposals/PagedPreview";
import { RichTextEditor } from "@/components/proposals/RichTextEditor";
import {
  PricingItem,
  ProposalContent,
  SECTION_META,
  SOCIAL_PLATFORM_OPTIONS,
  SocialPlatform,
  SocialPlatformBlock,
  defaultPricingItem,
  defaultSocialPlatform,
  mergedContent,
} from "@/lib/proposalContent";
import { api, ApiError, unwrapList } from "@/lib/api";
import { sendDocumentViaEmail } from "@/lib/sendDocumentEmail";
import { useToast } from "@/lib/toast";
import { useDirtySnapshot, useUnsavedChanges } from "@/lib/useUnsavedChanges";

type Client = { id: number; name: string; contact_email: string; contact_phone: string };

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];

function SectionCard({
  label,
  icon,
  enabled,
  onToggle,
  collapsed,
  onToggleCollapsed,
  children,
  toggleDisabled,
  pageBreakBefore,
  onPageBreakChange,
}: {
  label: string;
  icon: string;
  enabled: boolean;
  onToggle?: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  children: React.ReactNode;
  toggleDisabled?: boolean;
  pageBreakBefore?: boolean;
  onPageBreakChange?: (value: boolean) => void;
}) {
  return (
    <div className={`section-card${enabled ? "" : " section-disabled"}`}>
      <div className="section-card-head" onClick={onToggleCollapsed}>
        <i className={`bi ${icon}`} style={{ color: "var(--gold)", fontSize: 16 }} />
        <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{label}</span>
        {!toggleDisabled && onToggle && (
          <button
            type="button"
            className={`toggle-switch${enabled ? " on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-label={`Toggle ${label}`}
          />
        )}
        <i className={`bi ${collapsed ? "bi-chevron-down" : "bi-chevron-up"}`} style={{ color: "var(--text-muted)", fontSize: 12 }} />
      </div>
      {!collapsed && (
        <div className="section-card-body">
          {onPageBreakChange && (
            <label
              style={pageBreakLabel}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={!!pageBreakBefore}
                onChange={(e) => onPageBreakChange(e.target.checked)}
              />
              Start on new page
            </label>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

export default function ProposalBuilderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<ProposalContent | null>(null);
  const [docName, setDocName] = useState("");
  const [status, setStatus] = useState("draft");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [sending, setSending] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(SECTION_META.filter((s) => s.key !== "home").map((s) => String(s.key)))
  );

  const formState = useMemo(() => ({ content, docName, status }), [content, docName, status]);
  const { dirty, markClean } = useDirtySnapshot(formState, !loading && !!content);
  const { ConfirmDialog } = useUnsavedChanges(dirty);

  useEffect(() => {
    api<Client[] | { results: Client[] }>("/api/sales/clients")
      .then((d) => setClients(unwrapList(d)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api<{ content: ProposalContent; status: string; title: string }>(`/api/sales/proposals/${id}`)
      .then((p) => {
        const merged = mergedContent(p.content);
        setContent(merged);
        setDocName(p.title || merged.home.title || "Untitled Proposal");
        setStatus(p.status);
      })
      .catch(() => showToast("Couldn't load proposal.", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const clientOptions = useMemo(
    () => [{ value: "", label: "— Custom / not in list —" }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))],
    [clients]
  );

  const updateSection = <K extends keyof ProposalContent>(key: K, patch: Partial<ProposalContent[K]>) => {
    setContent((prev) => (prev ? { ...prev, [key]: { ...(prev[key] as object), ...patch } } : prev));
  };

  const toggleSection = (key: keyof ProposalContent) => {
    setContent((prev) => {
      if (!prev) return prev;
      const section = prev[key] as any;
      if (Array.isArray(section)) return prev;
      return { ...prev, [key]: { ...section, enabled: !section.enabled } };
    });
  };

  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async (): Promise<boolean> => {
    if (!content) return false;
    setSaving(true);
    try {
      const updated = await api<{ title: string }>(`/api/sales/proposals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          content,
          status,
          title: docName.trim() || content.home.title || "Untitled Proposal",
        }),
      });
      setDocName(updated.title || docName);
      markClean({
        content,
        docName: updated.title || docName,
        status,
      });
      showToast("Proposal saved.");
      return true;
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't save proposal." : err.message, "error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const exportAs = async (kind: "pdf" | "docx") => {
    const ok = await save();
    if (!ok) return;
    setExporting(kind);
    try {
      const res = await api<{ file_url: string }>(`/api/sales/proposals/${id}/${kind}`, { method: "POST" });
      window.open(res.file_url, "_blank");
    } catch (err: any) {
      showToast(err instanceof ApiError ? `Couldn't generate ${kind.toUpperCase()}.` : err.message, "error");
    } finally {
      setExporting(null);
    }
  };

  const sendToEmail = async () => {
    if (!content) return;
    const ok = await save();
    if (!ok) return;
    setSending(true);
    try {
      const res = await api<{ file_url: string }>(`/api/sales/proposals/${id}/pdf`, { method: "POST" });
      const to = content.home?.client_email || "";
      const subject = docName || content.home?.client_name || "Proposal";
      await sendDocumentViaEmail({
        pdfUrl: res.file_url,
        to,
        subject,
        body: `Please find the attached proposal.\n\nAttach the downloaded PDF if it is not already attached, then send.`,
        filename: `${subject.replace(/[^\w\-]+/g, "_")}.pdf`,
      });
      showToast(
        to
          ? "Email draft opened. Attach the downloaded PDF before sending."
          : "PDF downloaded. Add a client email on the Home page, or pick one in your mail app."
      );
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't prepare email." : err.message, "error");
    } finally {
      setSending(false);
    }
  };

  if (loading || !content) {
    return <p className="muted">Loading…</p>;
  }

  const home = content.home;

  const pickClient = (clientId: string) => {
    if (!clientId) {
      updateSection("home", { client_id: null });
      return;
    }
    const c = clients.find((c) => String(c.id) === clientId);
    if (!c) return;
    updateSection("home", {
      client_id: c.id,
      client_name: c.name,
      client_email: c.contact_email || "",
      client_phone: c.contact_phone || "",
    });
  };

  const addedPlatforms = new Set(content.social_medias.platforms.map((p) => p.platform));
  const availablePlatforms = SOCIAL_PLATFORM_OPTIONS.filter((o) => !addedPlatforms.has(o.value));
  const addPlatform = (platform: SocialPlatform) =>
    updateSection("social_medias", { platforms: [...content.social_medias.platforms, defaultSocialPlatform(platform)] });
  const removePlatform = (platform: SocialPlatform) =>
    updateSection("social_medias", { platforms: content.social_medias.platforms.filter((p) => p.platform !== platform) });
  const updatePlatform = (platform: SocialPlatform, patch: Partial<SocialPlatformBlock>) =>
    updateSection("social_medias", {
      platforms: content.social_medias.platforms.map((p) => (p.platform === platform ? { ...p, ...patch } : p)),
    });

  const updatePricing = (idx: number, patch: Partial<PricingItem>) =>
    setContent((prev) => (prev ? { ...prev, pricing: prev.pricing.map((it, i) => (i === idx ? { ...it, ...patch } : it)) } : prev));
  const addPricing = () => setContent((prev) => (prev ? { ...prev, pricing: [...prev.pricing, defaultPricingItem()] } : prev));
  const removePricing = (idx: number) =>
    setContent((prev) => (prev ? { ...prev, pricing: prev.pricing.filter((_, i) => i !== idx) } : prev));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {ConfirmDialog}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div>
          <BackLink href="/sales/proposals" label="Back to Proposals" />
          <DocNameField
            value={docName}
            onChange={setDocName}
            ariaLabel="Proposal name"
            placeholder="Untitled Proposal"
          />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 150 }}>
            <Select value={status} onChange={setStatus} options={STATUS_OPTIONS} ariaLabel="Status" />
          </div>
          <button className="btn btn-ghost" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="btn btn-ghost" disabled={sending || exporting !== null} onClick={sendToEmail}>
            <i className="bi bi-envelope" /> {sending ? "Preparing…" : "Send to"}
          </button>
          <button className="btn btn-ghost" disabled={exporting !== null} onClick={() => exportAs("docx")}>
            <i className="bi bi-file-earmark-word-fill" /> {exporting === "docx" ? "Exporting…" : "Export Word"}
          </button>
          <button className="btn btn-accent" disabled={exporting !== null} onClick={() => exportAs("pdf")}>
            <i className="bi bi-file-earmark-pdf-fill" /> {exporting === "pdf" ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </div>

      <div className="proposal-builder-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* 1. Home */}
          <SectionCard
            label="Home Page"
            icon="bi-house-door-fill"
            enabled={home.enabled}
            onToggle={() => toggleSection("home")}
            collapsed={collapsed.has("home")}
            onToggleCollapsed={() => toggleCollapsed("home")}
          >
            <div style={fieldGrid}>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>QTN No</label>
                <input className="input" value={home.qtn_no} onChange={(e) => updateSection("home", { qtn_no: e.target.value })} />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Date</label>
                <DatePicker value={home.date || ""} onChange={(v) => updateSection("home", { date: v })} ariaLabel="Proposal date" />
              </div>
            </div>
            <div>
              <label className="field-label">Cover title</label>
              <input className="input" value={home.title} onChange={(e) => updateSection("home", { title: e.target.value })} />
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Shown on the proposal cover inside the document.
              </p>
            </div>
            <div>
              <label className="field-label">Pick a client</label>
              <Select value={home.client_id ? String(home.client_id) : ""} onChange={pickClient} options={clientOptions} ariaLabel="Client" />
            </div>
            <div style={fieldGrid}>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Client name</label>
                <input className="input" value={home.client_name} onChange={(e) => updateSection("home", { client_name: e.target.value })} />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Client email</label>
                <input className="input" value={home.client_email} onChange={(e) => updateSection("home", { client_email: e.target.value })} />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Client phone</label>
                <input className="input" value={home.client_phone} onChange={(e) => updateSection("home", { client_phone: e.target.value })} />
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
              The cover background, tagline and contact bar are a fixed Kreativefolio template — not editable per proposal.
            </p>
          </SectionCard>

          {/* 2. About Kreativefolio */}
          <SectionCard
            label="About Kreativefolio"
            icon="bi-building"
            enabled={content.about_kreativefolio.enabled}
            onToggle={() => toggleSection("about_kreativefolio")}
            collapsed={collapsed.has("about_kreativefolio")}
            onToggleCollapsed={() => toggleCollapsed("about_kreativefolio")}
            pageBreakBefore={content.about_kreativefolio.page_break_before}
            onPageBreakChange={(v) => updateSection("about_kreativefolio", { page_break_before: v })}
          >
            <RichTextEditor
              value={content.about_kreativefolio.content}
              onChange={(html) => updateSection("about_kreativefolio", { content: html })}
            />
          </SectionCard>

          {/* 3. About the Client */}
          <SectionCard
            label="About the Client"
            icon="bi-person-badge-fill"
            enabled={content.about_client.enabled}
            onToggle={() => toggleSection("about_client")}
            collapsed={collapsed.has("about_client")}
            onToggleCollapsed={() => toggleCollapsed("about_client")}
            pageBreakBefore={content.about_client.page_break_before}
            onPageBreakChange={(v) => updateSection("about_client", { page_break_before: v })}
          >
            <RichTextEditor value={content.about_client.content} onChange={(html) => updateSection("about_client", { content: html })} />
            <ImageGalleryField
              proposalId={Number(id)}
              urls={content.about_client.image_urls}
              onChange={(image_urls) => updateSection("about_client", { image_urls })}
              label="Images"
            />
          </SectionCard>

          {/* 4. Traffic */}
          <SectionCard
            label="Traffic"
            icon="bi-graph-up-arrow"
            enabled={content.traffic.enabled}
            onToggle={() => toggleSection("traffic")}
            collapsed={collapsed.has("traffic")}
            onToggleCollapsed={() => toggleCollapsed("traffic")}
            pageBreakBefore={content.traffic.page_break_before}
            onPageBreakChange={(v) => updateSection("traffic", { page_break_before: v })}
          >
            <ImageGalleryField
              proposalId={Number(id)}
              urls={content.traffic.image_urls}
              onChange={(image_urls) => updateSection("traffic", { image_urls })}
              label="Images"
            />
          </SectionCard>

          {/* 5. Technical SEO */}
          <SectionCard
            label="Technical SEO"
            icon="bi-gear-fill"
            enabled={content.technical_seo.enabled}
            onToggle={() => toggleSection("technical_seo")}
            collapsed={collapsed.has("technical_seo")}
            onToggleCollapsed={() => toggleCollapsed("technical_seo")}
            pageBreakBefore={content.technical_seo.page_break_before}
            onPageBreakChange={(v) => updateSection("technical_seo", { page_break_before: v })}
          >
            <RichTextEditor value={content.technical_seo.content} onChange={(html) => updateSection("technical_seo", { content: html })} />
          </SectionCard>

          {/* 6. Keyword Strategy */}
          <SectionCard
            label="Keyword Strategy"
            icon="bi-search"
            enabled={content.keyword_strategy.enabled}
            onToggle={() => toggleSection("keyword_strategy")}
            collapsed={collapsed.has("keyword_strategy")}
            onToggleCollapsed={() => toggleCollapsed("keyword_strategy")}
            pageBreakBefore={content.keyword_strategy.page_break_before}
            onPageBreakChange={(v) => updateSection("keyword_strategy", { page_break_before: v })}
          >
            <ImageGalleryField
              proposalId={Number(id)}
              urls={content.keyword_strategy.image_urls}
              onChange={(image_urls) => updateSection("keyword_strategy", { image_urls })}
              label="Images"
            />
          </SectionCard>

          {/* 7. Onpage SEO */}
          <SectionCard
            label="Onpage SEO"
            icon="bi-file-earmark-code-fill"
            enabled={content.onpage_seo.enabled}
            onToggle={() => toggleSection("onpage_seo")}
            collapsed={collapsed.has("onpage_seo")}
            onToggleCollapsed={() => toggleCollapsed("onpage_seo")}
            pageBreakBefore={content.onpage_seo.page_break_before}
            onPageBreakChange={(v) => updateSection("onpage_seo", { page_break_before: v })}
          >
            <RichTextEditor value={content.onpage_seo.content} onChange={(html) => updateSection("onpage_seo", { content: html })} />
            <ImageGalleryField
              proposalId={Number(id)}
              urls={content.onpage_seo.image_urls}
              onChange={(image_urls) => updateSection("onpage_seo", { image_urls })}
              label="Images"
            />
          </SectionCard>

          {/* 8. GEO */}
          <SectionCard
            label="GEO"
            icon="bi-robot"
            enabled={content.geo.enabled}
            onToggle={() => toggleSection("geo")}
            collapsed={collapsed.has("geo")}
            onToggleCollapsed={() => toggleCollapsed("geo")}
            pageBreakBefore={content.geo.page_break_before}
            onPageBreakChange={(v) => updateSection("geo", { page_break_before: v })}
          >
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Description</label>
              <textarea
                className="input"
                rows={3}
                value={content.geo.description}
                onChange={(e) => updateSection("geo", { description: e.target.value })}
                style={{ resize: "vertical" }}
              />
            </div>
            <div>
              <label className="field-label">Recommendations</label>
              <RichTextEditor value={content.geo.recommendations} onChange={(html) => updateSection("geo", { recommendations: html })} />
            </div>
            <div>
              <label className="field-label">Our Approach</label>
              <RichTextEditor value={content.geo.approach} onChange={(html) => updateSection("geo", { approach: html })} />
            </div>
          </SectionCard>

          {/* 9. Social Medias */}
          <SectionCard
            label="Social Medias"
            icon="bi-share-fill"
            enabled={content.social_medias.enabled}
            onToggle={() => toggleSection("social_medias")}
            collapsed={collapsed.has("social_medias")}
            onToggleCollapsed={() => toggleCollapsed("social_medias")}
            pageBreakBefore={content.social_medias.page_break_before}
            onPageBreakChange={(v) => updateSection("social_medias", { page_break_before: v })}
          >
            {availablePlatforms.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {availablePlatforms.map((o) => (
                  <button key={o.value} type="button" className="btn btn-ghost btn-sm" onClick={() => addPlatform(o.value)}>
                    <i className={`bi ${o.icon}`} /> {o.label}
                  </button>
                ))}
              </div>
            )}
            {content.social_medias.platforms.map((p) => {
              const meta = SOCIAL_PLATFORM_OPTIONS.find((o) => o.value === p.platform)!;
              return (
                <div key={p.platform} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, opacity: p.enabled ? 1 : 0.55 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <i className={`bi ${meta.icon}`} style={{ color: "var(--gold)" }} />
                    <span style={{ flex: 1, fontWeight: 600 }}>{meta.label}</span>
                    <button
                      type="button"
                      className={`toggle-switch${p.enabled ? " on" : ""}`}
                      onClick={() => updatePlatform(p.platform, { enabled: !p.enabled })}
                      aria-label={`Toggle ${meta.label}`}
                    />
                    <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => removePlatform(p.platform)}>
                      <i className="bi bi-trash-fill" />
                    </button>
                  </div>
                  <label style={pageBreakLabel}>
                    <input
                      type="checkbox"
                      checked={!!p.page_break_before}
                      onChange={(e) => updatePlatform(p.platform, { page_break_before: e.target.checked })}
                    />
                    Start on new page
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <label className="field-label" style={{ marginTop: 0 }}>Description</label>
                      <textarea
                        className="input"
                        rows={2}
                        value={p.description}
                        onChange={(e) => updatePlatform(p.platform, { description: e.target.value })}
                        style={{ resize: "vertical" }}
                      />
                    </div>
                    <ImageGalleryField
                      proposalId={Number(id)}
                      urls={p.image_urls}
                      onChange={(image_urls) => updatePlatform(p.platform, { image_urls })}
                      label="Images"
                    />
                    <div>
                      <label className="field-label" style={{ marginTop: 0 }}>Key problems identified</label>
                      <RichTextEditor value={p.key_problems} onChange={(html) => updatePlatform(p.platform, { key_problems: html })} />
                    </div>
                    <div>
                      <label className="field-label" style={{ marginTop: 0 }}>Strategy</label>
                      <EditableTable
                        columns={[
                          { key: "category", label: "Category" },
                          { key: "details", label: "Details" },
                          { key: "goal", label: "Goal" },
                        ]}
                        rows={p.strategy_rows}
                        onChange={(rows) => updatePlatform(p.platform, { strategy_rows: rows })}
                        emptyRow={() => ({ category: "", details: "", goal: "" })}
                        addLabel="Add row"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </SectionCard>

          {/* 10. What We Can Do */}
          <SectionCard
            label="What We Can Do"
            icon="bi-lightbulb-fill"
            enabled={content.what_we_can_do.enabled}
            onToggle={() => toggleSection("what_we_can_do")}
            collapsed={collapsed.has("what_we_can_do")}
            onToggleCollapsed={() => toggleCollapsed("what_we_can_do")}
            pageBreakBefore={content.what_we_can_do.page_break_before}
            onPageBreakChange={(v) => updateSection("what_we_can_do", { page_break_before: v })}
          >
            <EditableTable
              columns={[
                { key: "area", label: "Area" },
                { key: "details", label: "How Kreativefolio Can Help" },
              ]}
              rows={content.what_we_can_do.rows}
              onChange={(rows) => updateSection("what_we_can_do", { rows })}
              emptyRow={() => ({ area: "", details: "" })}
              addLabel="Add row"
            />
          </SectionCard>

          {/* 11. Pricing (repeatable) */}
          <SectionCard
            label="Pricing"
            icon="bi-tag-fill"
            enabled={content.pricing.length > 0}
            collapsed={collapsed.has("pricing")}
            onToggleCollapsed={() => toggleCollapsed("pricing")}
            toggleDisabled
          >
            {content.pricing.map((item, idx) => (
              <div key={idx} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, opacity: item.enabled ? 1 : 0.55 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <input
                    className="input"
                    value={item.service_name}
                    onChange={(e) => updatePricing(idx, { service_name: e.target.value })}
                    placeholder="Service name"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className={`toggle-switch${item.enabled ? " on" : ""}`}
                    onClick={() => updatePricing(idx, { enabled: !item.enabled })}
                    aria-label={`Toggle ${item.service_name}`}
                  />
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => removePricing(idx)}>
                    <i className="bi bi-trash-fill" />
                  </button>
                </div>
                <label style={pageBreakLabel}>
                  <input
                    type="checkbox"
                    checked={!!item.page_break_before}
                    onChange={(e) => updatePricing(idx, { page_break_before: e.target.checked })}
                  />
                  Start on new page
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={fieldGrid}>
                    <div>
                      <input
                        className="field-label-input"
                        style={{ marginTop: 0 }}
                        value={item.ad_budget_label}
                        onChange={(e) => updatePricing(idx, { ad_budget_label: e.target.value })}
                        placeholder="Field label"
                      />
                      <input className="input" value={item.ad_budget} onChange={(e) => updatePricing(idx, { ad_budget: e.target.value })} />
                    </div>
                    <div>
                      <input
                        className="field-label-input"
                        style={{ marginTop: 0 }}
                        value={item.management_fee_label}
                        onChange={(e) => updatePricing(idx, { management_fee_label: e.target.value })}
                        placeholder="Field label"
                      />
                      <input className="input" value={item.management_fee} onChange={(e) => updatePricing(idx, { management_fee: e.target.value })} />
                    </div>
                  </div>
                  <EditableTable
                    columns={[
                      { key: "category", label: "Category" },
                      { key: "details", label: "Details" },
                      { key: "frequency", label: "Frequency" },
                    ]}
                    rows={item.rows}
                    onChange={(rows) => updatePricing(idx, { rows })}
                    emptyRow={() => ({ category: "", details: "", frequency: "" })}
                    addLabel="Add row"
                  />
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={addPricing}>
              <i className="bi bi-plus-lg" /> Add pricing section
            </button>
          </SectionCard>

          {/* 12. Terms */}
          <SectionCard
            label="Terms"
            icon="bi-file-text-fill"
            enabled={content.terms.enabled}
            onToggle={() => toggleSection("terms")}
            collapsed={collapsed.has("terms")}
            onToggleCollapsed={() => toggleCollapsed("terms")}
            pageBreakBefore={content.terms.page_break_before}
            onPageBreakChange={(v) => updateSection("terms", { page_break_before: v })}
          >
            <div style={fieldGrid}>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Duration</label>
                <input className="input" value={content.terms.duration} onChange={(e) => updateSection("terms", { duration: e.target.value })} />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Payment %</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="100"
                  value={content.terms.payment_percent}
                  onChange={(e) => updateSection("terms", { payment_percent: e.target.value })}
                />
              </div>
            </div>
          </SectionCard>

          {/* 13. Full page image */}
          <SectionCard
            label="Full Page Image"
            icon="bi-image-fill"
            enabled={content.full_page_image.enabled}
            onToggle={() => toggleSection("full_page_image")}
            collapsed={collapsed.has("full_page_image")}
            onToggleCollapsed={() => toggleCollapsed("full_page_image")}
          >
            <p className="muted" style={{ fontSize: 12.5, margin: "0 0 6px" }}>
              Renders full-bleed, without the header/footer used on every other page.
            </p>
            <ImageUploadField
              proposalId={Number(id)}
              value={content.full_page_image.image_url}
              onChange={(url) => updateSection("full_page_image", { image_url: url })}
              label="Image"
            />
          </SectionCard>
        </div>

        <div style={{ position: "sticky", top: 16, alignSelf: "flex-start" }}>
          <PagedPreview content={content} />
        </div>
      </div>
    </div>
  );
}

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
};

const pageBreakLabel: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "var(--text-muted)",
  cursor: "pointer",
  userSelect: "none",
  marginBottom: 4,
};
