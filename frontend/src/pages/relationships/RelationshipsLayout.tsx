import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { AlertLamp } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import { useRelationshipsData } from "@/hooks/useRelationshipsData";
import { isDispatcher } from "@/lib/roles";
import { SYSTEM_START, inboundShare } from "@/lib/metrics/relationships";
import { inboundHeadline } from "@/lib/relationships/inboundHeadline";
import { callListSummary } from "@/lib/relationships/callList";
import { utcDayKey } from "@/lib/relationships/dayKeys";
import { buildToday, type TodayModel } from "@/lib/relationships/todayQueue";
import { reviewStatus, type ReviewStatus } from "@/lib/relationships/review";
import { AgentSheet } from "@/components/relationships/AgentSheet";
import { ProspectSheet } from "@/components/relationships/ProspectSheet";
import { Toast, type ToastState } from "@/components/relationships/Toast";
import { PrimaryButton } from "@/components/relationships/primitives";
import type { TouchPrefill } from "@/components/relationships/LogTouchForm";
import type { RelationshipsContext } from "./context";

// /relationships — the shell: statusbar, the four tabs, one data hook, and
// the hosts for the agent sheet, + Prospect and the toast, so every view
// shares them. Brandie's daily surface; the owner-only controls live inside
// the sheet.

type Tab = "today" | "calls" | "tiers" | "review";
const TABS: { value: Tab; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "calls", label: "Call list" },
  { value: "tiers", label: "Tiers" },
  { value: "review", label: "Review" },
];
// Today, the Call list and the Review read their live context from the
// derived models (below) once the data is in; these are the fixed words and
// the fallbacks.
const SUB_LINE: Record<Tab, string> = {
  today: "the day's job — nothing sends itself",
  calls: "reactivation and prospects — the call list",
  tiers: "the owner sets the tiers — dash only suggests",
  review: "suggestions you approve — nothing re-tiers itself",
};
const isTab = (v: string | undefined): v is Tab => v === "today" || v === "calls" || v === "tiers" || v === "review";

type CallsSummary = ReturnType<typeof callListSummary>;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Today's live context: "Monday Sep 14 · 1 close-out · 2 callbacks".
const todaySubLine = (today: TodayModel | null, now: Date): string => {
  if (!today) return SUB_LINE.today;
  const day = now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  return `${day} · ${plural(today.closeOuts.length, "close-out")} · ${plural(today.callbacks.length, "callback")}`;
};

// The Call list's live context: "{n} lapsed · {k} prospects · {grades caption}".
const callsSubLine = (calls: CallsSummary | null): string => {
  if (!calls) return SUB_LINE.calls;
  return `${calls.lapsed} lapsed · ${plural(calls.prospects, "prospect")} · ${calls.caption}`;
};

// The Review's live context: "4 suggestions · 1 cooling · September unsigned".
// With the sign-offs missing the month is neither signed nor unsigned — it is
// unknown, and the line says so with a dash rather than a claim.
const reviewSubLine = (review: ReviewStatus | null, signOffsMissing: boolean): string => {
  if (!review) return SUB_LINE.review;
  const word = signOffsMissing ? "—" : review.signed ? "signed" : "unsigned";
  return `${plural(review.suggestions, "suggestion")} · ${review.cooling} cooling · ${review.periodName} ${word}`;
};

// Tab labels carry their counts once the data is in: "Today · 6",
// "Call list · 17" (this rotation — the recycle fold is not counted),
// "Review · 4" — the suggestions waiting for the owner's call.
const tabLabel = (tab: Tab, today: TodayModel | null, calls: CallsSummary | null, review: ReviewStatus | null): string => {
  const base = TABS.find((t) => t.value === tab)?.label ?? tab;
  if (tab === "today" && today) return `${base} · ${today.count}`;
  if (tab === "calls" && calls) return `${base} · ${calls.lapsed}`;
  if (tab === "review" && review && review.suggestions > 0) return `${base} · ${review.suggestions}`;
  return base;
};

const TOAST_MS = 6000;

// Shape-matched skeleton for the book while the agents or the loads are in
// flight — a loads retry included, so a failed slice is never shown as zeros.
const BookSkeleton = () => (
  <div className="mt-4 space-y-3">
    <Skeleton className="h-11" style={{ borderRadius: 10 }} />
    <Skeleton className="h-40" style={{ borderRadius: 12 }} />
    <Skeleton className="h-56" style={{ borderRadius: 12 }} />
  </div>
);

const RelationshipsLayout = () => {
  const data = useRelationshipsData();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isAdmin = !isDispatcher();

  const seg = pathname.split("/")[2];
  const tab: Tab = isTab(seg) ? seg : "today";

  const [sheetAgentId, setSheetAgentId] = useState<string | null>(null);
  const [sheetPrefill, setSheetPrefill] = useState<TouchPrefill | undefined>(undefined);
  const [prospectOpen, setProspectOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = useCallback<RelationshipsContext["notify"]>((message, action) => {
    setToast({ id: Date.now(), message, action });
  }, []);
  const openAgent = useCallback<RelationshipsContext["openAgent"]>((agentId, opts) => {
    setSheetPrefill(opts?.prefill);
    setSheetAgentId(agentId);
  }, []);
  const openProspect = useCallback(() => setProspectOpen(true), []);

  // INBOUND since system start — a fraction until ten attributed loads.
  const headline = useMemo(
    () => inboundHeadline(inboundShare(data.loads, SYSTEM_START, utcDayKey(data.now))),
    [data.loads, data.now],
  );

  // The derived queue, built once here so the tab count, the sub-line and
  // the Today view read the same object. null while the loads slice is
  // missing — Today withholds rather than show confident zeros.
  const today = useMemo<TodayModel | null>(
    () =>
      data.loadsReady && !data.loading
        ? buildToday({
            agents: data.agents,
            loads: data.loads,
            contacts: data.contacts,
            coverage: data.coverage,
            notes: data.notes,
            coords: data.coords,
            ladder: data.ladder,
            now: data.now,
          })
        : null,
    [data.loadsReady, data.loading, data.agents, data.loads, data.contacts, data.coverage, data.notes, data.coords, data.ladder, data.now],
  );

  // The Call list's numbers for its tab and sub-line; withheld while the
  // loads are in flight, the same way.
  const calls = useMemo<CallsSummary | null>(
    () => (data.loadsReady ? callListSummary(data.agents, data.loads, data.contacts, data.coverage, data.now) : null),
    [data.loadsReady, data.agents, data.loads, data.contacts, data.coverage, data.now],
  );

  // The Review's three numbers for the tab suffix and the sub-line, read from
  // the same derivations the Review itself draws. null while the loads slice is
  // missing — a suggestion rests on RPM, and no loads means no verdict.
  const review = useMemo<ReviewStatus | null>(
    () =>
      data.loadsReady && !data.loading
        ? reviewStatus({
            agents: data.agents,
            loads: data.loads,
            contacts: data.contacts,
            history: data.history,
            reviews: data.reviews,
            ladder: data.ladder,
            now: data.now,
          })
        : null,
    [data.loadsReady, data.loading, data.agents, data.loads, data.contacts, data.history, data.reviews, data.ladder, data.now],
  );

  const ctx: RelationshipsContext = useMemo(
    () => ({ ...data, isAdmin, today, openAgent, openProspect, notify }),
    [data, isAdmin, today, openAgent, openProspect, notify],
  );

  const tabs = useMemo(
    () => TABS.map((t) => ({ value: t.value, label: tabLabel(t.value, today, calls, review) })),
    [today, calls, review],
  );
  const subLine =
    tab === "today"
      ? todaySubLine(today, data.now)
      : tab === "calls"
        ? callsSubLine(calls)
        : tab === "review"
          ? reviewSubLine(review, data.errors.reviews != null)
          : SUB_LINE[tab];

  const sheetAgent = sheetAgentId ? data.agents.find((a) => a.agent_id === sheetAgentId) ?? null : null;
  const bookError = data.errors.agents ?? data.errors.contacts ?? data.errors.brokers;

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        {/* statusbar — the house pattern */}
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">RELATIONSHIPS</h1>
          <span className="font-condensed font-medium text-[15px] text-dim min-w-0 truncate max-w-full" title={subLine}>
            {subLine}
          </span>
          <span className="flex-1" />
          <Link
            to="/relationships/review"
            title={`inbound share of attributed loads since ${SYSTEM_START}`}
            className="inline-flex items-center gap-2 h-[30px] px-3 rounded-full font-condensed font-semibold text-[13px] bg-gradient-to-b from-plate-a to-plate-lo border-t border-white/10 shadow hover:text-hot"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber" style={{ boxShadow: "0 0 7px rgba(232,148,10,.9)" }} />
            INBOUND {data.loadsLoading ? "…" : data.loadsError ? "—" : headline}
          </Link>
          <PrimaryButton size="md" onClick={openProspect}>
            <UserPlus size={15} /> + Prospect
          </PrimaryButton>
        </div>

        <SegmentedTabs
          tabs={tabs}
          value={tab}
          onChange={(v) => navigate(`/relationships/${v}`)}
          size="md"
          className="mt-3"
          ariaLabel="Relationships views"
        />

        {bookError && (
          <AlertLamp category="book" className="mt-3">
            {bookError} —{" "}
            <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => void data.reload()}>
              retry
            </button>
          </AlertLamp>
        )}
        {data.loadsError && (
          <AlertLamp category="loads" className="mt-3">
            loads didn't come through — load counts, RPM and the inbound chip are incomplete ·{" "}
            <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={data.retryLoads}>
              retry
            </button>
          </AlertLamp>
        )}
        {data.errors.notes && (
          <AlertLamp category="notes" className="mt-3">
            agent notes didn't come through — a nurture flag you skipped may show again until they do ·{" "}
            <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => void data.reload()}>
              retry
            </button>
          </AlertLamp>
        )}
        {/* A failed history or sign-off read must never pass for truth: without
            the trail a hold looks lifted, and without the sign-offs a signed
            month looks unsigned. */}
        {data.errors.history && (
          <AlertLamp category="history" className="mt-3">
            the tier history didn't come through — a suggestion you held may show again until it does ·{" "}
            <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => void data.reload()}>
              retry
            </button>
          </AlertLamp>
        )}
        {data.errors.reviews && (
          <AlertLamp category="reviews" className="mt-3">
            the sign-offs didn't come through — the month may read unsigned ·{" "}
            <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => void data.reload()}>
              retry
            </button>
          </AlertLamp>
        )}

        {data.loading || data.loadsLoading ? <BookSkeleton /> : <Outlet context={ctx} />}
      </div>

      {sheetAgent && (
        <AgentSheet
          key={sheetAgent.agent_id}
          agent={sheetAgent}
          loads={data.loads}
          contacts={data.contacts}
          coverage={data.coverage}
          ladder={data.ladder}
          now={data.now}
          loadsReady={data.loadsReady}
          isAdmin={isAdmin}
          prefill={sheetPrefill}
          onClose={() => setSheetAgentId(null)}
          reload={data.reload}
          notify={notify}
        />
      )}
      <ProspectSheet
        open={prospectOpen}
        agents={data.agents}
        brokers={data.brokers}
        onClose={() => setProspectOpen(false)}
        onOpenAgent={(id) => openAgent(id)}
        reload={data.reload}
        notify={notify}
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};

export default RelationshipsLayout;
