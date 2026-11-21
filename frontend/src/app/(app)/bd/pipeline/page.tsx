"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ContactBar } from "@/components/bd/ContactBar";
import { LeadForm } from "@/components/bd/LeadForm";
import { Sheet } from "@/components/bd/Sheet";
import { MoveSheet, useStageMove } from "@/components/bd/StageDialogs";
import { Loader } from "@/components/Loader";
import { Select } from "@/components/Select";
import { api } from "@/lib/api";
import { hasModuleAccess, useAuth } from "@/lib/auth";
import { SOURCES, STAGES, fmtMoney, fmtWhen, isOverdue, type BDCard, type BDPipeline, type StageKey } from "@/lib/bd";
import { timeAgo } from "@/lib/notifications";
import { useToast } from "@/lib/toast";

const STALE_DAYS = 5;
const STAGE_COLOR: Record<string, string> = {
  new: "#3b82f6",
  contacted: "#0ea5e9",
  qualified: "#14b8a6",
  meeting: "#8b5cf6",
  proposal_sent: "#f59e0b",
  negotiation: "#f43f5e",
  won: "#22c55e",
  lost: "#ef4444",
};

type SortKey = "follow_up" | "value" | "newest" | "quiet";
const SORTS: { value: SortKey; label: string }[] = [
  { value: "follow_up", label: "Sort: Follow-up" },
  { value: "value", label: "Sort: Highest value" },
  { value: "newest", label: "Sort: Newest" },
  { value: "quiet", label: "Sort: Quiet longest" },
];
const FOLLOW_OPTIONS = [
  { value: "", label: "Any" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "none", label: "Nothing scheduled" },
];
const VALUE_OPTIONS = [
  { value: "", label: "Any" },
  { value: "yes", label: "Has a value" },
  { value: "no", label: "No value yet" },
];

export default function PipelinePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const isSuperadmin = user?.role === "superadmin";
  const hasAccess = isSuperadmin || hasModuleAccess(user?.module_access, "bd");

  const [data, setData] = useState<BDPipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [owner, setOwner] = useState("");
  const [owners, setOwners] = useState<{ id: number; name: string }[]>([]);
  const [phoneStage, setPhoneStage] = useState<StageKey>("qualified");
  const [dragging, setDragging] = useState<BDCard | null>(null);
  const [over, setOver] = useState<StageKey | null>(null);
  const [moveCard, setMoveCard] = useState<BDCard | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // search / filters / sort (all applied on this screen, to the cards already loaded)
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [follow, setFollow] = useState("");
  const [valued, setValued] = useState("");
  const [sort, setSort] = useState<SortKey>("follow_up");
  const [closedLimit, setClosedLimit] = useState(50); // Won / Lost cards shown; "Show more" grows it
  const [filtersOpen, setFiltersOpen] = useState(false);

  const boardRef = useRef<HTMLDivElement>(null);
  const [boardH, setBoardH] = useState<number | null>(null);

  // Search, filters and sort run on the server, over every deal, so counts and totals are exact.
  const load = useCallback(() => {
    const q = new URLSearchParams({ sort, closed_limit: String(closedLimit) });
    if (owner) q.set("owner", owner);
    if (search.trim()) q.set("search", search.trim());
    if (source) q.set("source", source);
    if (follow) q.set("follow_up", follow);
    if (valued) q.set("has_value", valued);
    api<BDPipeline>(`/api/bd/pipeline?${q}`)
      .then(setData)
      .catch(() => showToast("Couldn't load the pipeline.", "error"))
      .finally(() => setLoading(false));
  }, [owner, search, source, follow, valued, sort, closedLimit, showToast]);

  useEffect(() => {
    if (!hasAccess) return;
    const t = setTimeout(load, 250); // wait while typing
    return () => clearTimeout(t);
  }, [hasAccess, load]);

  useEffect(() => {
    if (isSuperadmin) api<{ id: number; name: string }[]>("/api/bd/leads/owners").then(setOwners).catch(() => {});
  }, [isSuperadmin]);

  // Size the board to the space left on screen, so its sideways scrollbar is always in view.
  useEffect(() => {
    const fit = () => {
      const el = boardRef.current;
      if (el) setBoardH(Math.max(380, Math.floor(window.innerHeight - el.getBoundingClientRect().top - 20)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [loading, data]);

  const { requestMove, dialogs } = useStageMove(load);

  const drop = (target: StageKey) => {
    const card = dragging;
    setDragging(null);
    setOver(null);
    if (!card || card.stage === target) return;
    if (card.stage === "won" && target === "lost") {
      showToast("Move it back to an open stage first.", "error");
      return;
    }
    void requestMove(card.id, target, card.title);
  };

  const filterCount = (source ? 1 : 0) + (follow ? 1 : 0) + (valued ? 1 : 0);
  const filtering = !!search.trim() || filterCount > 0;

  const cols = data?.columns ?? [];

  if (!user) return null;
  if (!hasAccess) return <p className="muted">You don&apos;t have access to Business Development.</p>;

  const openCols = cols.filter((c) => c.key !== "won" && c.key !== "lost");
  const openCount = openCols.reduce((n, c) => n + c.count, 0);
  const openTotal = Number(data?.open_total_aed ?? 0);
  const phoneCol = cols.find((c) => c.key === phoneStage);

  const clearFilters = () => {
    setSource("");
    setFollow("");
    setValued("");
  };

  const cardMeta = (c: BDCard) => {
    const quiet = c.kind === "deal" && !["won", "lost"].includes(c.stage) ? Math.floor((Date.now() - new Date(c.last_activity_at).getTime()) / 86400000) : 0;
    return (
      <>
        <span>{Number(c.value) > 0 ? fmtMoney(c.value, c.currency) : "No value"}</span>
        {c.next_follow_up_at ? (
          <span className={isOverdue(c.next_follow_up_at) ? "is-late" : ""}>
            <i className="bi bi-alarm" /> {fmtWhen(c.next_follow_up_at)}
          </span>
        ) : quiet >= STALE_DAYS ? (
          <span className="is-late">{quiet}d quiet</span>
        ) : (
          <span>{timeAgo(c.last_activity_at)}</span>
        )}
      </>
    );
  };

  const renderCard = (c: BDCard) => {
    const quiet = c.kind === "deal" && !["won", "lost"].includes(c.stage) ? Math.floor((Date.now() - new Date(c.last_activity_at).getTime()) / 86400000) : 0;
    const late = !!c.next_follow_up_at && isOverdue(c.next_follow_up_at);
    return (
      <div
        key={c.id}
        className={`bd-pcard${dragging?.id === c.id ? " is-dragging" : ""}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(c.id));
          // Re-rendering inside dragstart can make the browser cancel the drag.
          setTimeout(() => setDragging(c), 0);
        }}
        onDragEnd={() => {
          setDragging(null);
          setOver(null);
        }}
        onClick={() => router.push(`/bd/leads/${c.id}`)}
      >
        <div className="bd-pcard__top">
          <div className="bd-pl-row bd-pl-row--title">
            <i className="bi bi-buildings-fill" />
            <span className="bd-pcard__title">{c.title}</span>
          </div>
          <button
            type="button"
            className="bd-iconbtn bd-pcard__move"
            title="Move to…"
            aria-label={`Move ${c.title}`}
            onClick={(e) => {
              e.stopPropagation();
              setMoveCard(c);
            }}
          >
            <i className="bi bi-arrow-left-right" />
          </button>
        </div>
        {c.contact_name && (
          <div className="bd-pl-row">
            <i className="bi bi-person" />
            <span>{c.contact_name}</span>
          </div>
        )}
        <div className="bd-pl-row">
          <i className="bi bi-tag" />
          <span className="bd-pl-value">{Number(c.value) > 0 ? fmtMoney(c.value, c.currency) : "No value"}</span>
        </div>
        <div className="bd-pl-row">
          {c.next_follow_up_at ? (
            <span className={`bd-pl-chip${late ? " is-late" : ""}`}>
              <i className={`bi ${late ? "bi-calendar-x" : "bi-alarm"}`} /> {fmtWhen(c.next_follow_up_at)}
            </span>
          ) : quiet >= STALE_DAYS ? (
            <span className="bd-pl-chip is-late">
              <i className="bi bi-hourglass-split" /> {quiet}d quiet
            </span>
          ) : (
            <span className="bd-pl-chip">
              <i className="bi bi-calendar3" /> {timeAgo(c.last_activity_at)}
            </span>
          )}
        </div>
        {isSuperadmin && (
          <div className="bd-pl-row bd-pl-row--owner">
            <i className="bi bi-person-badge" />
            <span>{c.owner_name}</span>
          </div>
        )}
      </div>
    );
  };

  const renderCol = (col: (typeof cols)[number]) => {
    const meta = STAGES.find((s) => s.key === col.key)!;
    const color = STAGE_COLOR[col.key];
    return (
      <div
        key={col.key}
        className={`bd-col${over === col.key ? " is-over" : ""}`}
        style={{ "--c": color } as React.CSSProperties}
        onDragOver={(e) => {
          if (!dragging) return;
          e.preventDefault();
          setOver(col.key);
        }}
        onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
        onDrop={(e) => {
          e.preventDefault();
          drop(col.key);
        }}
      >
        <div className="bd-col__head">
          <div className="bd-col__title">
            <i className={`bi ${meta.icon}`} /> {col.label}
            <span className="bd-col__count">{col.count}</span>
          </div>
          <div className="bd-col__total">{fmtMoney(col.total_aed, "AED")}</div>
        </div>
        <div className="bd-col__cards">
          {col.cards.map(renderCard)}
          {col.cards.length === 0 && (
            <div className="bd-col__drop">
              <i className="bi bi-inbox" />
              {dragging ? (
                <b>Drop here</b>
              ) : filtering ? (
                <b>No matches</b>
              ) : (
                <>
                  <b>Nothing yet</b>
                  <span>Deals in {col.label.toLowerCase()} will appear here</span>
                </>
              )}
            </div>
          )}
          {col.count > col.cards.length && (
            <div style={{ textAlign: "center", fontSize: 12 }} className="muted">
              Showing {col.cards.length} of {col.count}
              <button type="button" className="bd-link" style={{ marginLeft: 8 }} onClick={() => setClosedLimit((n) => n + 50)}>
                Show more
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bd-page">
      {dialogs}
      <div className="bd-pl-head">
        <div className="bd-pl-head__title">
          <span className="bd-pl-tile">
            <i className="bi bi-bar-chart-fill" />
          </span>
          <div>
            <h1>Pipeline</h1>
            <div className="bd-sub">{data ? <>{fmtMoney(openTotal, "AED")} in open deals · {openCount} in pipeline</> : " "}</div>
          </div>
        </div>
        <div className="bd-pl-tools">
          <label className="bd-pl-search">
            <i className="bi bi-search" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deals, companies, or contacts..."
              aria-label="Search the pipeline"
            />
            {search && (
              <button type="button" aria-label="Clear search" onClick={() => setSearch("")}>
                <i className="bi bi-x-lg" />
              </button>
            )}
          </label>
          <button type="button" className={`bd-pl-btn${filterCount ? " is-on" : ""}`} onClick={() => setFiltersOpen(true)}>
            <i className="bi bi-funnel" /> Filters {filterCount > 0 && <b>{filterCount}</b>}
          </button>
          <div className="bd-pl-sort">
            <Select value={sort} onChange={(v) => setSort(v as SortKey)} options={SORTS} ariaLabel="Sort cards" />
          </div>
          {isSuperadmin && owners.length > 0 && (
            <div className="bd-pl-sort">
              <Select value={owner} onChange={setOwner} options={[{ value: "", label: "All BDEs" }, ...owners.map((o) => ({ value: String(o.id), label: o.name }))]} ariaLabel="BDE" />
            </div>
          )}
          <button className="btn" onClick={() => setAddOpen(true)}>
            <i className="bi bi-plus-lg" /> Add lead
          </button>
        </div>
      </div>

      {loading || !data ? (
        <Loader />
      ) : (
        <>
          {/* Desktop: one row of stages, drag between them; scrolls sideways along the bottom */}
          <div className="bd-desktop-only">
            <div className="bd-board" ref={boardRef} style={boardH ? { height: boardH } : undefined}>
              {cols.map(renderCol)}
            </div>
          </div>

          {/* Phone: stage tabs + a list, "Move to…" instead of dragging */}
          <div className="bd-phone-only" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="bd-chips bd-chips--scroll">
              {cols.map((col) => (
                <button key={col.key} className={`bd-chip${phoneStage === col.key ? " is-on" : ""}`} onClick={() => setPhoneStage(col.key)}>
                  {col.label} <small>{col.count}</small>
                </button>
              ))}
            </div>
            {phoneCol && (
              <>
                <div className="bd-sub" style={{ marginTop: -4 }}>
                  {phoneCol.count} · {fmtMoney(phoneCol.total_aed, "AED")}
                </div>
                {phoneCol.cards.length === 0 ? (
                  <div className="bd-list"><div className="bd-empty">{filtering ? "No matches." : `Nothing in ${phoneCol.label}.`}</div></div>
                ) : (
                  <div className="bd-cards-only bd-list" style={{ display: "flex" }}>
                    {phoneCol.cards.map((c) => (
                      <div className="bd-leadcard" key={c.id} onClick={() => router.push(`/bd/leads/${c.id}`)}>
                        <div className="bd-leadcard__top">
                          <div style={{ minWidth: 0 }}>
                            <div className="bd-leadcard__name">{c.title}</div>
                            {c.contact_name && <div className="muted" style={{ fontSize: 12.5 }}>{c.contact_name}</div>}
                          </div>
                        </div>
                        <div className="bd-pcard__meta">{cardMeta(c)}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginLeft: -8 }} onClick={(e) => e.stopPropagation()}>
                          <ContactBar lead={c} compact onLogged={load} />
                          <button className="bd-link" onClick={() => setMoveCard(c)}>
                            Move to… <i className="bi bi-chevron-right" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        footer={
          <>
            <button className="btn btn-ghost" onClick={clearFilters} disabled={!filterCount}>
              Clear all
            </button>
            <button className="btn" onClick={() => setFiltersOpen(false)}>
              Done
            </button>
          </>
        }
      >
        <div className="bd-field">
          <span className="bd-label">Source</span>
          <Select value={source} onChange={setSource} options={[{ value: "", label: "All sources" }, ...SOURCES]} ariaLabel="Source" />
        </div>
        <div className="bd-field">
          <span className="bd-label">Follow-up</span>
          <Select value={follow} onChange={setFollow} options={FOLLOW_OPTIONS} ariaLabel="Follow-up" />
        </div>
        <div className="bd-field">
          <span className="bd-label">Value</span>
          <Select value={valued} onChange={setValued} options={VALUE_OPTIONS} ariaLabel="Value" />
        </div>
      </Sheet>

      <MoveSheet
        open={!!moveCard}
        onClose={() => setMoveCard(null)}
        current={moveCard?.stage ?? "new"}
        title={moveCard?.title ?? ""}
        allowEarly={moveCard?.kind === "lead"}
        onPick={(s) => {
          const card = moveCard;
          setMoveCard(null);
          if (card) void requestMove(card.id, s, card.title);
        }}
      />
      <LeadForm open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => load()} />
    </div>
  );
}
