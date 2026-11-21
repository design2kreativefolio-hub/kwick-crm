"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Confetti, DayRow, FirstUpCard, ProgressRing } from "@/components/bd/DayParts";
import { FocusMode } from "@/components/bd/FocusMode";
import { LeadForm } from "@/components/bd/LeadForm";
import { LogSheet } from "@/components/bd/LogSheet";
import { fromCard, fromFollowUp, type DayItem } from "@/components/bd/dayItem";
import { Loader } from "@/components/Loader";
import { Select } from "@/components/Select";
import { api } from "@/lib/api";
import { hasModuleAccess, useAuth } from "@/lib/auth";
import { type BDMyDay } from "@/lib/bd";
import { useToast } from "@/lib/toast";

type TabKey = "overdue" | "today" | "new_leads" | "stale_deals" | "meetings";

const TABS: { key: TabKey; label: string; empty: string; emptyHint: string; icon: string; tone: string }[] = [
  { key: "overdue", label: "Overdue", empty: "Nothing overdue", emptyHint: "You're right on top of your follow-ups.", icon: "bi-exclamation-circle-fill", tone: "danger" },
  { key: "today", label: "Today", empty: "Nothing due today", emptyHint: "Use the time to reach out to a new lead.", icon: "bi-sun-fill", tone: "warn" },
  { key: "new_leads", label: "New leads", empty: "Every new lead has been contacted", emptyHint: "Fresh leads will show up here, best prospects first.", icon: "bi-stars", tone: "info" },
  { key: "stale_deals", label: "Gone quiet", empty: "No deals are going cold", emptyHint: "Every open deal has had recent activity.", icon: "bi-hourglass-split", tone: "purple" },
  { key: "meetings", label: "Meetings", empty: "No meetings this week", emptyHint: "Book one from any lead's page.", icon: "bi-camera-video-fill", tone: "ok" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  const diff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86400000
  );
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

function partOfDay(iso: string) {
  const h = new Date(iso).getHours();
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
}

function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 450);
      setShown(Math.round(start + (value - start) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  return <>{shown}</>;
}

export function MyDayView() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const isSuperadmin = user?.role === "superadmin";
  const hasAccess = isSuperadmin || hasModuleAccess(user?.module_access, "bd");

  const [data, setData] = useState<BDMyDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [owner, setOwner] = useState("");
  const [owners, setOwners] = useState<{ id: number; name: string }[]>([]);
  const [tab, setTab] = useState<TabKey | null>(null);
  const [popping, setPopping] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [logFor, setLogFor] = useState<{ id: number; name: string } | null>(null);
  const [focusItems, setFocusItems] = useState<DayItem[] | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [search, setSearch] = useState("");
  const [hotOnly, setHotOnly] = useState(false);

  const load = useCallback(() => {
    const qs = owner ? `?owner=${owner}` : "";
    api<BDMyDay>(`/api/bd/my-day${qs}`)
      .then(setData)
      .catch(() => showToast("Couldn't load My Day.", "error"))
      .finally(() => setLoading(false));
  }, [owner, showToast]);

  useEffect(() => {
    if (hasAccess) load();
  }, [hasAccess, load]);

  useEffect(() => {
    if (isSuperadmin) api<{ id: number; name: string }[]>("/api/bd/leads/owners").then(setOwners).catch(() => {});
  }, [isSuperadmin]);

  // Everything on the page in one shape.
  const lists = useMemo<Record<TabKey, DayItem[]>>(
    () => ({
      overdue: (data?.overdue ?? []).map(fromFollowUp),
      today: (data?.today ?? []).map(fromFollowUp),
      meetings: (data?.meetings ?? []).map(fromFollowUp),
      new_leads: (data?.new_leads ?? []).map((c) => fromCard(c, "new_lead")),
      stale_deals: (data?.stale_deals ?? []).map((c) => fromCard(c, "quiet_deal")),
    }),
    [data]
  );

  const active: TabKey = useMemo(() => {
    if (tab) return tab;
    const c = data?.counts;
    if (!c) return "overdue";
    return TABS.find((t) => c[t.key] > 0)?.key ?? "today";
  }, [tab, data]);

  const c = data?.counts;
  const needsYou = c ? c.overdue + c.today : 0;
  const doneToday = data?.done_today ?? 0;

  /** Optimistically take a follow-up off every list, then tell the server. */
  const removeLocally = (followId: number) =>
    setData((d) => {
      if (!d) return d;
      const had = (arr: { id: number }[]) => arr.some((f) => f.id === followId);
      const strip = <T extends { id: number }>(arr: T[]) => arr.filter((f) => f.id !== followId);
      return {
        ...d,
        overdue: strip(d.overdue),
        today: strip(d.today),
        meetings: strip(d.meetings),
        done_today: (d.done_today ?? 0) + 1,
        counts: {
          ...d.counts,
          overdue: d.counts.overdue - (had(d.overdue) ? 1 : 0),
          today: d.counts.today - (had(d.today) ? 1 : 0),
          meetings: d.counts.meetings - (had(d.meetings) ? 1 : 0),
        },
      };
    });

  const markDone = async (it: DayItem, opts: { quiet?: boolean } = {}) => {
    if (!it.followId) return;
    const fid = it.followId;
    const wasLast = needsYou === 1 && (lists.overdue.some((x) => x.followId === fid) || lists.today.some((x) => x.followId === fid));
    setPopping((p) => [...p, it.key]);
    setTimeout(() => {
      removeLocally(fid);
      setPopping((p) => p.filter((k) => k !== it.key));
      if (wasLast) setConfetti(true);
    }, 280);
    try {
      await api(`/api/bd/follow-ups/${fid}/complete`, { method: "POST" });
      if (!opts.quiet) {
        showToast(`Done - ${it.title}. Tap to undo`, "success", async () => {
          try {
            await api(`/api/bd/follow-ups/${fid}`, { method: "PATCH", body: JSON.stringify({ done: false }) });
            load();
          } catch {
            showToast("Couldn't undo that.", "error");
          }
        });
      }
    } catch {
      setPopping((p) => p.filter((k) => k !== it.key));
      load();
      showToast("Couldn't mark that done.", "error");
    }
  };

  const snooze = async (it: DayItem, at: Date) => {
    if (!it.followId) return;
    try {
      await api(`/api/bd/follow-ups/${it.followId}`, { method: "PATCH", body: JSON.stringify({ due_at: at.toISOString() }) });
      showToast(`Snoozed to ${at.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}`);
      load();
    } catch {
      showToast("Couldn't snooze that.", "error");
    }
  };

  const openLead = (it: DayItem) => router.push(`/bd/leads/${it.leadId}`);

  // The page is only useful if the next step is obvious: the most urgent thing floats to the top.
  const firstUp: DayItem | null = useMemo(() => {
    const hottest = [...lists.new_leads].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    return lists.overdue[0] ?? lists.today[0] ?? hottest ?? lists.stale_deals[0] ?? null;
  }, [lists]);

  const focusQueue: DayItem[] = useMemo(() => {
    const seen = new Set<string>();
    return [...lists.overdue, ...lists.today, ...[...lists.new_leads].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), ...lists.stale_deals].filter(
      (it) => (seen.has(it.key) ? false : (seen.add(it.key), true))
    );
  }, [lists]);

  const openFocus = () => setFocusItems(focusQueue);

  const q = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      lists[active].filter(
        (it) =>
          (!hotOnly || it.scoreLabel === "hot") &&
          (!q || `${it.title} ${it.contact} ${it.company} ${it.note ?? ""}`.toLowerCase().includes(q))
      ),
    [lists, active, hotOnly, q]
  );

  const grouped = useMemo(() => {
    const groupOf = (it: DayItem) =>
      active === "overdue" || active === "meetings" ? (it.dueAt ? dayLabel(it.dueAt) : "") : active === "today" && it.dueAt ? partOfDay(it.dueAt) : "";
    const out: { label: string; items: DayItem[] }[] = [];
    for (const it of visible) {
      const label = groupOf(it);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(it);
      else out.push({ label, items: [it] });
    }
    return out;
  }, [visible, active]);

  if (!user) return null;
  if (!hasAccess) return <p className="muted">You don&apos;t have access to Business Development.</p>;

  const first = user.full_name?.split(" ")[0] || "there";
  const current = TABS.find((t) => t.key === active)!;
  const dayTotal = doneToday + needsYou;
  const showFirst = !!firstUp && !hotOnly && !q;
  let rowIndex = 0;

  return (
    <div className="bd-page bd-day">
      <div className="bd-head">
        <div className="bd-head__left">
          <ProgressRing done={doneToday} total={dayTotal} />
          <div>
            <h1>{isSuperadmin ? "Overview" : `${greeting()}, ${first}`}</h1>
            <div className="bd-sub">
              {c
                ? needsYou
                  ? `${needsYou} follow-up${needsYou === 1 ? "" : "s"} need you today${doneToday ? ` · ${doneToday} done so far` : ""}.`
                  : doneToday
                    ? `You're all caught up - ${doneToday} done today.`
                    : "You're all caught up."
                : " "}
            </div>
          </div>
        </div>
        <div className="bd-head__actions">
          {isSuperadmin && owners.length > 0 && (
            <div style={{ minWidth: 180 }}>
              <Select value={owner} onChange={setOwner} options={[{ value: "", label: "All BDEs" }, ...owners.map((o) => ({ value: String(o.id), label: o.name }))]} ariaLabel="BDE" />
            </div>
          )}
          {focusQueue.length > 0 && (
            <button className="btn btn-ghost bd-focus-btn" onClick={openFocus}>
              <i className="bi bi-play-circle-fill" /> Focus mode
            </button>
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
          <div className="bd-stats" role="tablist">
            {TABS.map((t, n) => (
              <motion.button
                key={t.key}
                role="tab"
                aria-selected={active === t.key}
                className={`bd-stat bd-stat--${t.tone}${active === t.key ? " is-on" : ""}${t.key === "overdue" && c![t.key] > 0 ? " is-alert" : ""}`}
                onClick={() => setTab(t.key)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: n * 0.04, duration: 0.25 }}
                whileTap={{ scale: 0.97 }}
              >
                <span className="bd-stat__icon">
                  <i className={`bi ${t.icon}`} />
                </span>
                <span className="bd-stat__n">
                  <CountUp value={c![t.key]} />
                </span>
                <span className="bd-stat__label">{t.label}</span>
              </motion.button>
            ))}
          </div>

          {showFirst && firstUp && (
            <FirstUpCard
              item={firstUp}
              onDone={firstUp.followId ? () => markDone(firstUp) : undefined}
              onSnooze={firstUp.followId ? (at) => snooze(firstUp, at) : undefined}
              onOpen={() => openLead(firstUp)}
              onLogged={load}
            />
          )}

          <div className="bd-daybar">
            <div className="bd-daysearch">
              <i className="bi bi-search" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${current.label.toLowerCase()}…`} aria-label="Search this list" />
              {search && (
                <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
                  <i className="bi bi-x-lg" />
                </button>
              )}
            </div>
            <button type="button" className={`bd-chip${hotOnly ? " is-on" : ""}`} onClick={() => setHotOnly((v) => !v)} aria-pressed={hotOnly}>
              <i className="bi bi-fire" /> Hot only
            </button>
          </div>

          <div className="bd-list bd-day-list">
            {visible.length === 0 ? (
              <div className="bd-empty bd-empty--rich">
                <span className="bd-empty__icon">
                  <i className={`bi ${q || hotOnly ? "bi-funnel" : "bi-check2-circle"}`} />
                </span>
                <b>{q || hotOnly ? "No matches" : current.empty}</b>
                <span>{q || hotOnly ? "Try clearing the search or the Hot filter." : current.emptyHint}</span>
                {!q && !hotOnly && (active === "new_leads" || active === "today") && (
                  <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={() => setAddOpen(true)}>
                    <i className="bi bi-plus-lg" /> Add a lead
                  </button>
                )}
              </div>
            ) : (
              <>
                {grouped.map((g) => (
                  <div key={`${active}-${g.label || "all"}`} className="bd-group">
                    {g.label && <div className="bd-group__label">{g.label}</div>}
                    <AnimatePresence initial={false}>
                      {g.items.map((it) => (
                        <DayRow
                          key={it.key}
                          item={it}
                          index={rowIndex++}
                          popping={popping.includes(it.key)}
                          showOwner={isSuperadmin}
                          onOpen={() => openLead(it)}
                          onDone={it.followId ? () => markDone(it) : undefined}
                          onSnooze={it.followId ? (at) => snooze(it, at) : undefined}
                          onLog={() => setLogFor({ id: it.leadId, name: it.title })}
                          onLogged={load}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}

      <button className="bd-fab" onClick={() => setAddOpen(true)} aria-label="Add lead">
        <i className="bi bi-plus-lg" />
      </button>

      {focusItems && focusItems.length > 0 && (
        <FocusMode
          items={focusItems}
          onClose={() => {
            setFocusItems(null);
            load();
          }}
          onDone={(it) => markDone(it, { quiet: true })}
          onSnooze={snooze}
          onOpen={(it) => {
            setFocusItems(null);
            openLead(it);
          }}
          onChanged={load}
        />
      )}
      {confetti && <Confetti onDone={() => setConfetti(false)} />}

      <LeadForm open={addOpen} onClose={() => setAddOpen(false)} onSaved={(l) => router.push(`/bd/leads/${l.id}`)} />
      {logFor && <LogSheet open onClose={() => setLogFor(null)} leadId={logFor.id} leadName={logFor.name} onSaved={load} />}
    </div>
  );
}
