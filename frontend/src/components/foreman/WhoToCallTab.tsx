import { useState, useMemo, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useLoads } from "@/hooks/useLoads";
import { useAgents } from "@/hooks/useAgents";
import { useCityCoords } from "@/hooks/useCityCoords";
import { useRateTargets } from "@/hooks/useRateTargets";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { ForgedPlate, Well } from "@/components/ui/ForgedPlate";
import { AlertLamp } from "@/components/ui/StatusPill";
import { getAgentContacts, type AgentContact } from "@/services/agentContactsService";
import { getAgentCoverage, type AgentCoverage } from "@/services/agentCoverageService";
import { isDispatcher } from "@/lib/roles";
import { money } from "@/lib/format";
import { shortDate } from "@/lib/relationships/dayKeys";
import { PARKED_RADIUS_MILES, parkedNearby, parkedNearbyExplicitOnly, type ParkedNearbyRow } from "@/lib/relationships/parkedNearby";
import { AgentRow } from "@/components/relationships/AgentRow";
import { AgentSheet } from "@/components/relationships/AgentSheet";
import { CodeChip, SectionHead } from "@/components/relationships/primitives";
import { Toast, type ToastState } from "@/components/relationships/Toast";
import {
  buildForemanBoard,
  distanceLabel,
  TYPE_LABELS,
  type Anchor,
  type AgentRanking,
  type ForemanMode,
  type LoadTypeFocus,
} from "@/lib/metrics/foreman";

const money2 = (n: number) => `$${n.toFixed(2)}`;
const TOAST_MS = 6000;

// The rate benchmark line: how the agent's $/mi compares to your realized median
// for the load type they're judged on.
const RateNote = ({ r }: { r: AgentRanking }) => {
  if (r.rpm == null)
    return <span className="text-faint">no {TYPE_LABELS[r.loadType].toLowerCase()} loads yet</span>;
  if (r.rateDelta == null || r.benchmark == null) return null;
  const up = r.rateDelta >= 0;
  return (
    <span style={{ color: up ? "#5dcaa5" : "#8494ab" }}>
      {up ? "+" : "−"}
      {money2(Math.abs(r.rateDelta)).slice(1)} vs your {TYPE_LABELS[r.loadType].toLowerCase()} avg
    </span>
  );
};

const historySub = (r: AgentRanking) => {
  if (r.daysSince == null) return "no delivered loads yet";
  const dwell = r.dwellLoads > 0 ? "detention owed" : "low dwell";
  return `last ${r.daysSince}d ago · ${dwell}`;
};

// The place under the miles, led by what backs it. The word comes first
// because that is the question a number invites — "~95 mi" from a market
// nobody has shipped out of yet is a different call than 95 miles from a
// market two loads proved (6A).
const originSub = (r: AgentRanking) => {
  if (!r.nearestOrigin) return "";
  const place = `${r.nearestOrigin.city}, ${r.nearestOrigin.state}`;
  return r.nearestSource === "claimed"
    ? `claimed — freight out of ${place}`
    : `proved — loads out of ${place}`;
};

// Decision 6A: a market an agent NAMED on a call measures exactly like one
// their loads proved — the caption is the only difference, drawn dashed the
// way the CoverageEditor draws a stated market, so nobody mistakes a claim
// for a fact.
const ProofWord = ({ r, className = "" }: { r: AgentRanking; className?: string }) => {
  if (!r.nearestOrigin || r.nearestSource == null) return null;
  const claimed = r.nearestSource === "claimed";
  return (
    <span
      className={`font-condensed text-[11px] text-faint ${claimed ? "border-b border-dashed border-faint" : ""} ${className}`}
      title={
        claimed
          ? "a market this agent named on a call — measured the same, not yet proved by a load"
          : "proved by a load this agent gave you"
      }
    >
      {claimed ? "claimed" : "proved"}
    </span>
  );
};

// The 3-letter code the agent wears, drawn the two ways the Agencies Nod Sheet
// draws it — their OWN posting code dashed, the agency's shared desk lit. Same
// CodeChip the book uses everywhere else, so a name reads identically on the
// Foreman and on the Relationships rows. Nothing renders when neither code is
// on file: the board stays quiet rather than running a NO CODE plate down every
// row (the ranked list is your own booked agents, not a roster to fill in).
const RankCodeChip = ({ r }: { r: AgentRanking }) =>
  r.agencyCode ? <CodeChip code={r.agencyCode} kind={r.codeKind ?? "agency"} /> : null;

// Direct or Spot as a chip. The class NEVER sorts the list (it breaks score
// ties inside the scorer and nowhere else) — it just says which kind of call
// you're about to make.
const ClassChip = ({ r, size = "md" }: { r: AgentRanking; size?: "sm" | "md" }) => (
  <span
    className={`font-condensed font-semibold rounded ${size === "sm" ? "text-[10px] px-1.5 py-px" : "text-[11px] px-2 py-0.5"}`}
    style={
      r.bucket === "direct"
        ? { color: "#5dcaa5", background: "rgba(93,202,165,.13)" }
        : { color: "#8494ab", background: "rgba(132,148,171,.10)" }
    }
  >
    {r.bucket === "direct" ? "DIRECT" : "SPOT"}
  </span>
);

// ---- the one forged plate: the top call ----
const TopCall = ({ r }: { r: AgentRanking }) => (
  <ForgedPlate chamfer tilt className="p-4 sm:p-5">
    <div className="flex items-center gap-2 mb-2">
      <span className="font-forge text-[12px] tracking-wider px-2.5 py-1 rounded-md bg-amber text-canvas font-bold">
        {"★"} TOP CALL
      </span>
      <span className="font-condensed text-[12px] font-semibold px-2 py-0.5 rounded-md bg-well text-hot">
        {TYPE_LABELS[r.loadType]}
      </span>
      {r.isNew && (
        <span className="font-condensed text-[11px] font-semibold px-2 py-0.5 rounded" style={{ color: "#5dcaa5", background: "rgba(53,160,140,.13)" }}>
          NEW
        </span>
      )}
      <ClassChip r={r} />
    </div>

    <div className="flex items-baseline gap-2.5 flex-wrap">
      <Link
        to={`/agents/${r.agentId}`}
        className="font-display text-[26px] text-amber leading-none hover:text-hot transition-colors"
      >
        {r.agentName}
      </Link>
      <RankCodeChip r={r} />
    </div>

    <div className="grid grid-cols-3 gap-3 mt-4 mb-3">
      <div>
        <p className="text-[11px] uppercase tracking-widest text-faint font-condensed">Proximity</p>
        <p className="font-display text-[24px] text-ink leading-none mt-1">
          {distanceLabel(r)} <ProofWord r={r} className="ml-1" />
        </p>
        <p className="text-[12px] text-dim mt-1">{originSub(r)}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-widest text-faint font-condensed">Rate</p>
        <p className="font-display text-[24px] text-ink leading-none mt-1">
          {r.rpm != null ? money2(r.rpm) : "—"}
          {r.rpm != null && <span className="font-condensed text-[13px] text-dim"> /mi gross</span>}
        </p>
        <p className="text-[12px] mt-1"><RateNote r={r} /></p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-widest text-faint font-condensed">History</p>
        <p className="font-display text-[24px] text-ink leading-none mt-1">
          {r.loadCount} load{r.loadCount === 1 ? "" : "s"}
        </p>
        <p className="text-[12px] text-dim mt-1">{historySub(r)}</p>
      </div>
    </div>

    <Well className="px-3 py-2.5 flex items-center gap-3">
      <span className="text-[11px] uppercase tracking-widest text-amber font-condensed shrink-0">Why</span>
      <span className="text-[13.5px] text-ink/90">{r.why}</span>
    </Well>
  </ForgedPlate>
);

// ---- flat reading rows: #2..N ----
// ONE list, in score order. The class rides as a chip, never as a section:
// hard-sorting Direct above Spot put a 0.54 direct customer over a 0.81 spot
// agent on screen, which is not what the scorer decided (decision 6A).
//
// The grid the rows and the header word above them share. On a phone only the
// name and the miles survive — the two-column shape AgentRow uses everywhere
// else, so the Foreman reads like the rest of the app on a 390px screen. On
// md+ the sheet's five fields: # · agent · proximity · rate · history. There
// is no sixth door column — the agent's name is already the link.
const ROW_GRID = "grid-cols-[minmax(0,1fr)_72px] md:grid-cols-[20px_minmax(0,1fr)_78px_70px_88px]";

const RankedRow = ({ r, rank }: { r: AgentRanking; rank: number }) => (
  <div className={`grid items-center gap-3 px-3.5 py-3 border-t border-hairline-lo ${ROW_GRID}`}>
    <span className="hidden md:block font-display text-[17px] text-faint">{rank}</span>
    <div className="min-w-0">
      <div className="flex items-baseline gap-2 flex-wrap">
        <Link to={`/agents/${r.agentId}`} className="font-condensed text-[15px] text-amber hover:text-hot transition-colors">
          {r.agentName}
        </Link>
        <RankCodeChip r={r} />
        <ClassChip r={r} size="sm" />
      </div>
      <div className="text-[11.5px] truncate">
        {r.isNew ? (
          <span className="font-condensed font-semibold uppercase tracking-wide" style={{ color: "#5dcaa5" }}>
            New {"·"} building
          </span>
        ) : (
          <span className="text-dim">{originSub(r)}</span>
        )}
      </div>
    </div>
    <span className="text-right leading-tight">
      <span className="font-display text-[17px] text-ink block">{distanceLabel(r)}</span>
      <ProofWord r={r} />
    </span>
    <span className="hidden md:block text-right leading-tight">
      <span className="font-display text-[17px] block">
        {r.rpm != null ? money2(r.rpm) : <span className="text-faint">{"—"}</span>}
      </span>
      {r.rpm != null && <span className="font-condensed text-[11px] text-faint">/mi gross</span>}
    </span>
    <span className="hidden md:block text-right leading-tight">
      <span className="font-condensed text-[13px] text-dim block">
        {r.loadCount} load{r.loadCount === 1 ? "" : "s"}
      </span>
      <span className="font-condensed text-[11px] text-faint">{historySub(r)}</span>
    </span>
  </div>
);

// The ranked rows under the Top Call — one list, score order, no groups.
const RankedList = ({ rows, startRank }: { rows: AgentRanking[]; startRank: number }) => {
  if (rows.length === 0) return null;
  return (
    <div className="ds2-board mt-3">
      <div className={`hidden md:grid gap-3 px-3.5 pt-3 pb-1.5 ${ROW_GRID}`}>
        <span className="text-[11px] uppercase tracking-widest text-faint font-condensed">#</span>
        <span className="text-[11px] uppercase tracking-widest text-faint font-condensed">Agent</span>
        <span className="text-[11px] uppercase tracking-widest text-faint font-condensed text-right">Proximity</span>
        <span className="text-[11px] uppercase tracking-widest text-faint font-condensed text-right">Rate</span>
        <span className="text-[11px] uppercase tracking-widest text-faint font-condensed text-right">History</span>
      </div>
      {rows.map((r, i) => (
        <RankedRow key={r.agentId} r={r} rank={startRank + i} />
      ))}
    </div>
  );
};

// ---- PARKED · WITHIN 75 MI (REL-01 v2.0 §4) ----
// Parked agents are hidden from every list and never owed outreach; when the
// truck goes empty near their freight they surface here, dimmed, under the
// ranked rows — grab their board freight, no message owed. Tap → the agent
// sheet (Unpark, or "a two-way contact brings them back" for the dormant).
// The row is the nodded mock's .row.wide: name + code + PARKED; line 2
// "{place} · {n} loads · dormant since {Mon d}" or "parked — {reason}"; then
// "{mi} mi", "{n} · ${gross}" (delivered count · gross of delivered loads),
// and "{days}d" quiet — the call list's quiet, "—" when never or not known.
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const parkedContext = (r: ParkedNearbyRow): string => {
  const place = `${r.place.city}, ${r.place.state}`;
  const loads = plural(r.delivered, "load");
  if (!r.dormant) return `${place} · ${loads} · parked — ${r.reason ?? "no reason recorded"}`;
  return `${place} · ${loads} · dormant since ${shortDate(r.since) ?? "—"}`;
};

const ParkedGroup = ({ anchor, rows, onOpen }: { anchor: Anchor; rows: ParkedNearbyRow[]; onOpen: (agentId: string) => void }) => (
  <div className="ds2-board mt-3 overflow-hidden opacity-70">
    <SectionHead right={<span>harvest their freight — no outreach owed</span>}>
      Parked · within {PARKED_RADIUS_MILES} mi of {anchor.city}, {anchor.state} · {rows.length}
    </SectionHead>
    {rows.map((r) => (
      <AgentRow
        key={r.agent.agent_id}
        agent={r.agent}
        chip={{ kind: "parked", label: "Parked" }}
        context={parkedContext(r)}
        daysSince={r.daysQuiet}
        right={{ value: r.daysQuiet == null ? "—" : `${r.daysQuiet}d`, caption: "quiet" }}
        market={
          <>
            <b className="font-semibold text-ink">{Math.round(r.miles)}</b> mi
          </>
        }
        loadsCell={
          <>
            <b className="font-semibold text-ink">{r.delivered}</b> · {money(r.gross)}
          </>
        }
        onOpen={() => onOpen(r.agent.agent_id)}
      />
    ))}
  </div>
);

const FOCUS_TABS: { value: LoadTypeFocus; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "standard flatbed", label: "Flatbed" },
  { value: "oversize", label: "Oversize" },
  { value: "hazmat", label: "Hazmat" },
  { value: "heavy haul", label: "Heavy" },
];
const MODE_TABS: { value: ForemanMode; label: string }[] = [
  { value: "balanced", label: "Balanced" },
  { value: "closest", label: "Closest" },
  { value: "best-rate", label: "Best rate" },
];

const Loading = () => (
  <div className="space-y-3">
    <div className="ds2-board h-14 animate-pulse" />
    <div className="ds2-forged h-40 animate-pulse" />
    <div className="ds2-board h-52 animate-pulse" />
  </div>
);

const Empty = ({ msg }: { msg: string }) => (
  <div className="ds2-board p-8 text-center text-dim">{msg}</div>
);

// The contact log and the stated markets — what the parked group and the
// agent sheet read beyond loads and agents. Refetched with the agents after a
// write from the sheet (park / unpark / a logged touch).
//
// `ready` = the log LANDED without error. Only then may the board judge
// dormancy (contacts handed over) and the parked group list derived parks;
// in flight, or after a failure, the Foreman shows the owner's explicit parks
// only and says so — an empty array is never mistaken for "no contacts",
// which would park every quiet agent on first paint. The error is kept, not
// swallowed, so the tab can name it; a refetch keeps the last good log on
// screen until the new one lands.
const useForemanBook = (refreshKey: number) => {
  const [contacts, setContacts] = useState<AgentContact[]>([]);
  const [coverage, setCoverage] = useState<AgentCoverage[]>([]);
  const [book, setBook] = useState<{ settled: boolean; error: string | null }>({ settled: false, error: null });
  // The clock the parked group judges dormancy against — refreshed with the
  // book so a tab left open does not keep yesterday's "since".
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  useEffect(() => {
    let active = true;
    Promise.allSettled([getAgentContacts(), getAgentCoverage()]).then(([c, cov]) => {
      if (!active) return;
      if (c.status === "fulfilled") setContacts(c.value);
      if (cov.status === "fulfilled") setCoverage(cov.value); // never rejects — degrades to []
      setBook({
        settled: true,
        error: c.status === "rejected" ? (c.reason instanceof Error ? c.reason.message : "couldn't load the contact log") : null,
      });
      setRefreshedAt(Date.now());
    });
    return () => {
      active = false;
    };
  }, [refreshKey]);
  const now = useMemo(() => new Date(refreshedAt), [refreshedAt]);
  return {
    contacts,
    coverage,
    now,
    loading: !book.settled, // the first fetch is still in flight
    ready: book.settled && book.error == null,
    error: book.error,
  };
};

export const WhoToCallTab = () => {
  const [bookKey, setBookKey] = useState(0);
  const { loads, isLoading: loadsLoading, error: loadsError } = useLoads(0);
  const { agents, isLoading: agentsLoading } = useAgents(bookKey);
  const { contacts, coverage, now, loading: bookLoading, ready: contactsReady, error: contactsError } = useForemanBook(bookKey);
  // The claimed markets warm the coordinate cache alongside the loads —
  // decision 6A ranks a claim by real miles, which it can only do once that
  // city holds a coordinate.
  const coords = useCityCoords(loads, coverage);
  const targets = useRateTargets(loads);

  const [focus, setFocus] = useState<LoadTypeFocus>("any");
  const [mode, setMode] = useState<ForemanMode>("balanced");
  const [sheetAgentId, setSheetAgentId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = useCallback((message: string, action?: ToastState["action"]) => {
    setToast({ id: Date.now(), message, action });
  }, []);
  // The sheet's refresh after a write — the agents and the book refetch.
  const reloadBook = useCallback(async () => {
    setBookKey((k) => k + 1);
  }, []);

  // The contact log is handed over only once it has landed (undefined = the
  // documented "explicit parks only" mode); the parked group likewise judges
  // dormancy only off a real log, and lists the owner's explicit parks alone
  // until then.
  // The stated markets ride along with the contact log: decision 6A counts a
  // market an agent NAMED as a footprint point, measured like any other.
  const board = useMemo(
    () =>
      buildForemanBoard(loads, agents, coords, {
        focus,
        mode,
        contacts: contactsReady ? contacts : undefined,
        coverage,
        now,
      }),
    [loads, agents, coords, focus, mode, contactsReady, contacts, coverage, now],
  );
  const parked = useMemo(
    () =>
      contactsReady
        ? parkedNearby(agents, loads, coverage, coords, board.anchor, contacts, now)
        : parkedNearbyExplicitOnly(agents, loads, coverage, coords, board.anchor, now),
    [contactsReady, agents, loads, coverage, coords, board.anchor, contacts, now],
  );
  const sheetAgent = sheetAgentId ? agents.find((a) => a.agent_id === sheetAgentId) ?? null : null;

  // First paint waits for the book too, so the rankings never race the log.
  if (loadsLoading || agentsLoading || bookLoading) return <Loading />;
  if (!board.anchor)
    return <Empty msg="No committed or delivered loads yet — add a load and the Foreman will tell you who to call." />;

  const [top, ...rest] = board.rankings;
  const anchorHint =
    board.anchor.source === "committed" ? "after your booked load delivers" : "empty here now";
  const parkedGroup = parked.length > 0 ? <ParkedGroup anchor={board.anchor} rows={parked} onOpen={setSheetAgentId} /> : null;

  return (
    <div>
      {/* controls */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-faint font-condensed">Looking for</span>
          <SegmentedTabs size="sm" tabs={FOCUS_TABS} value={focus} onChange={setFocus} ariaLabel="Load type focus" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-faint font-condensed">Rank by</span>
          <SegmentedTabs size="sm" tabs={MODE_TABS} value={mode} onChange={setMode} ariaLabel="Rank by" />
        </div>
      </div>

      {contactsError && (
        <AlertLamp category="contacts" className="mb-4">
          contact log didn't load — parked shows the owner's explicit parks only; the ranked rows are unaffected ·{" "}
          <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => void reloadBook()}>
            retry
          </button>
        </AlertLamp>
      )}

      {/* anchor */}
      <div className="ds2-board flex items-center gap-3 px-4 py-3 mb-4">
        <span className="text-amber text-[15px]">{"◉"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-faint font-condensed">Empty next</p>
          <p className="font-condensed text-[18px] font-semibold text-ink leading-tight">
            {board.anchor.city}, {board.anchor.state}
            <span className="text-dim font-normal text-[12px] ml-2">{anchorHint}</span>
          </p>
        </div>
      </div>

      {board.rankings.length === 0 ? (
        <>
          <Empty
            msg={
              focus === "any"
                ? "No agents to rank yet — book a load and they'll show up here."
                : `You haven't booked ${TYPE_LABELS[focus].toLowerCase()} freight yet — switch to "Any" to see everyone.`
            }
          />
          {parkedGroup}
        </>
      ) : (
        <>
          {/* top call */}
          {top && <TopCall r={top} />}

          {/* the rest — ONE list, in the score's own order */}
          <RankedList rows={rest} startRank={2} />

          {/* parked, within 75 mi — under the ranked rows, dimmed */}
          {parkedGroup}

          {/* footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3 px-1">
            <p className="text-[11.5px] text-faint max-w-xl">
              One list, in score order: straight-line distance to where you'll be empty — from a market a
              load proved or one they claimed on a call — your gross $/mi within load type, and your
              history. Direct or Spot is a chip, not a rank; it only breaks a tie. A call list from who
              you've booked, not a live load feed.
              {board.coverage.withCoords < board.coverage.total &&
                " Distances sharpen to real miles as new cities finish geocoding."}
            </p>
            <Link to="/guide" className="font-condensed text-[12.5px] text-dim hover:text-ink whitespace-nowrap">
              How it's ranked {"→"}
            </Link>
          </div>
        </>
      )}

      {sheetAgent && (
        <AgentSheet
          key={sheetAgent.agent_id}
          agent={sheetAgent}
          loads={loads}
          contacts={contacts}
          coverage={coverage}
          ladder={targets.bookingLadder}
          now={now}
          loadsReady={!loadsLoading && loadsError == null}
          isAdmin={!isDispatcher()}
          onClose={() => setSheetAgentId(null)}
          reload={reloadBook}
          notify={notify}
        />
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
