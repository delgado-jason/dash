import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLoads } from "@/hooks/useLoads";
import { useTrips } from "@/hooks/useTrips";
import { useAgents } from "@/hooks/useAgents";
import { useCityCoords } from "@/hooks/useCityCoords";
import { useRateTargets } from "@/hooks/useRateTargets";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Panel } from "@/components/ui/Panel";
import { Well } from "@/components/ui/Well";
import { AlertLamp } from "@/components/ui/StatusPill";
import { getAgentContacts, type AgentContact } from "@/services/agentContactsService";
import { getAgentCoverage, type AgentCoverage } from "@/services/agentCoverageService";
import { money, rpm as fmtRpm } from "@/lib/format";
import { fmtPerDay, perDayTone, perDayToneWord, type DailyTargets } from "@/lib/metrics/perDay";
import { perDayTextClass } from "@/components/lanes/rpmStyle";
import { shortDate } from "@/lib/dates/dayKeys";
import { PARKED_RADIUS_MILES, parkedNearby, type ParkedNearbyRow } from "@/lib/metrics/parkedNearby";
import { AgentRow } from "@/components/agents/AgentRow";
import { CodeChip, SectionHead } from "@/components/ui/primitives";
import { standingLabel } from "@/lib/agents/standing";
import type { RateVerdict } from "@/lib/metrics/agentByType";
import {
  buildForemanBoard,
  distanceLabel,
  TYPE_LABELS,
  type Anchor,
  type AgentRanking,
  type ForemanMode,
  type LoadTypeFocus,
} from "@/lib/metrics/foreman";

// ──────────────────────────────────────────────────────────────────────────
// THE FOREMAN UNDER THE RATING-ONLY RULE (the retirement sheet, calls 2–6).
// Your rating is printed on every row and acted on: a desk rated 1 is never
// ranked and sits under its own heading; a 2 is ranked and dimmed; ties
// break by rating. The rate is the file's — gross a driven mile against the
// rung for the book, the Scorer's word — so the Foreman and the file say the
// same thing about a desk. Direct/Spot is gone (the file's haul sentence says
// what kind of desk it is, from the loads). Parked is your explicit call
// only. A row opens the file: park, unpark, a logged call, the footprint are
// all there, so the sheet that duplicated it is gone with its toast.
// ──────────────────────────────────────────────────────────────────────────

const money2 = (n: number) => `$${n.toFixed(2)}`;

// The Scorer's words, coloured the way the agents list colours them.
const VERDICT_META: Record<RateVerdict, { label: string; fg: string }> = {
  "below-cost": { label: "below cost", fg: "var(--color-status-negative-text)" },
  thin: { label: "thin", fg: "var(--color-amber-hi)" },
  profitable: { label: "profitable", fg: "var(--color-cat2)" },
  solid: { label: "solid", fg: "var(--color-cat2)" },
  prime: { label: "prime", fg: "var(--color-hot)" },
};

const RATING_TONE: Record<number, string> = {
  5: "text-status-positive-text",
  4: "text-status-positive-text",
  3: "text-dim",
  2: "text-status-aware-text",
  1: "text-status-negative-text",
};

// Your call, in the scale's own words — "4 · Good" — toned by what it means.
const YourCall = ({ r, size = "sm" }: { r: AgentRanking; size?: "sm" | "md" }) => (
  <span
    className={`font-condensed font-semibold whitespace-nowrap ${size === "md" ? "text-[14px] tracking-[.06em] uppercase" : "text-[12px]"} ${
      r.rating != null ? (RATING_TONE[r.rating] ?? "text-dim") : "text-faint"
    }`}
  >
    {r.standing == null ? "Unrated" : standingLabel(r.standing)}
  </span>
);

// The rate: the median gross a driven mile for the judged type, then the
// Scorer's word — or the count when one load is all there is.
const RateWord = ({ r }: { r: AgentRanking }) => {
  if (r.rpm == null)
    return <span className="text-faint">no {TYPE_LABELS[r.loadType].toLowerCase()} loads yet</span>;
  const v = r.verdict ? VERDICT_META[r.verdict] : null;
  if (v) return <span style={{ color: v.fg }}>{v.label}</span>;
  return (
    <span className="text-faint">
      {r.typeLoadCount} load{r.typeLoadCount === 1 ? "" : "s"} — no verdict yet
    </span>
  );
};

const RungNote = ({ r }: { r: AgentRanking }) => {
  if (r.rung == null) return <span className="text-faint">no rung yet — a filed P&amp;L month grades</span>;
  if (r.rateDelta == null) return <span className="text-faint">rung {fmtRpm(r.rung)}</span>;
  const up = r.rateDelta >= 0;
  return (
    <span style={{ color: up ? "var(--color-cat2)" : "var(--color-dim)" }}>
      {up ? "+" : "−"}
      {money2(Math.abs(r.rateDelta)).slice(1)} against the {fmtRpm(r.rung)} rung
    </span>
  );
};

// The $/day that rides under every $/mi on this board (decision 3A): what the
// agent's freight pays per DAY of the truck, weighted over the same delivered
// loads the $/mi reads. Green/amber/red against the ladder's daily target
// (2A), with the verdict said in words. Nothing renders without a figure —
// the board never draws a $0 day for an agent whose loads have no dates.
const PerDayNote = ({
  r,
  daily,
  withWord,
}: {
  r: AgentRanking;
  daily: DailyTargets | null;
  withWord?: boolean;
}) => {
  if (r.perDay == null) return null;
  const tone = perDayTone(r.perDay, daily);
  const word = withWord ? perDayToneWord(tone) : null;
  return (
    <>
      {/* No ladder yet (no P&L) is no verdict, not "no data" — the figure
          stays in the board's own ink rather than going grey. */}
      <b className={`font-semibold ${tone ? perDayTextClass(tone) : "text-ink"}`}>
        {fmtPerDay(r.perDay)}
      </b>
      <span className="text-dim"> /day</span>
      {word && <span className="text-dim"> · {word}</span>}
    </>
  );
};

const historySub = (r: AgentRanking) => {
  if (r.daysSince == null) return "no delivered loads yet";
  const dwell = r.dwellLoads > 0 ? "detention owed" : "low dwell";
  return `last ${r.daysSince}d ago · ${dwell}`;
};

// "Oct 1 · 45 d" — the newest touch of any kind; "no call logged"; or the
// log's absence, said rather than drawn as "never".
const spokenCell = (r: AgentRanking): { value: string; sub: string } => {
  if (r.daysSinceSpoken === undefined) return { value: "—", sub: "log didn't load" };
  if (r.daysSinceSpoken == null || !r.lastSpokenTo) return { value: "—", sub: "no call logged" };
  return {
    value: r.daysSinceSpoken === 0 ? "today" : `${r.daysSinceSpoken} d`,
    sub: shortDate(r.lastSpokenTo) ?? "",
  };
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
// way the file draws a claimed market, so nobody mistakes a claim for a fact.
const ProofWord = ({ r, className = "" }: { r: AgentRanking; className?: string }) => {
  if (!r.nearestOrigin || r.nearestSource == null) return null;
  const claimed = r.nearestSource === "claimed";
  return (
    <span
      className={`font-condensed text-[12px] text-faint ${claimed ? "border-b border-dashed border-faint" : ""} ${className}`}
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
// draws it — their OWN posting code dashed, the agency's shared desk lit.
// Nothing renders when neither code is on file.
const RankCodeChip = ({ r }: { r: AgentRanking }) =>
  r.agencyCode ? <CodeChip code={r.agencyCode} kind={r.codeKind ?? "agency"} /> : null;

// A desk worked once that cleared its own book's rung — the list's mark.
const SecondCall = () => (
  <span
    className="font-condensed text-[11px] font-semibold tracking-[.06em] uppercase whitespace-nowrap"
    style={{ color: "var(--color-cat2)" }}
    title="one load, and it cleared the rung for its own freight"
  >
    second call
  </span>
);

// ---- the top call ----
const TopCall = ({ r, daily }: { r: AgentRanking; daily: DailyTargets | null }) => {
  const spoken = spokenCell(r);
  return (
    <Panel className={`p-4 sm:p-5 ${r.avoid ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="ds2-label">Top call</span>
        <span className="font-condensed text-[13px] font-semibold px-2 py-0.5 rounded-md bg-well text-hot">
          {TYPE_LABELS[r.loadType]}
        </span>
        {r.isNew && (
          <span className="font-condensed text-[12px] font-semibold px-2 py-0.5 rounded" style={{ color: "var(--color-cat2)", background: "color-mix(in srgb, var(--color-cat2) 13%, transparent)" }}>
            NEW
          </span>
        )}
        {r.secondCall && <SecondCall />}
      </div>

      <div className="flex items-baseline gap-2.5 flex-wrap">
        <Link
          to={`/agents/${r.agentId}`}
          className="font-display text-[28px] text-amber leading-none hover:text-hot transition-colors"
        >
          {r.agentName}
        </Link>
        <RankCodeChip r={r} />
        <YourCall r={r} size="md" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 mb-3">
        <div>
          <p className="text-[12px] uppercase tracking-widest text-faint font-condensed">Proximity</p>
          <p className="font-condensed font-semibold tabular-nums text-[26px] text-ink leading-none mt-1">
            {distanceLabel(r)} <ProofWord r={r} className="ml-1" />
          </p>
          <p className="text-[13px] text-dim mt-1">{originSub(r)}</p>
        </div>
        <div>
          <p className="text-[12px] uppercase tracking-widest text-faint font-condensed">Rate · {TYPE_LABELS[r.loadType].toLowerCase()}</p>
          <p className="font-condensed font-semibold tabular-nums text-[26px] text-ink leading-none mt-1">
            {r.rpm != null ? money2(r.rpm) : "—"}
            {r.rpm != null && <span className="font-condensed text-[14px] text-dim"> a driven mile</span>}
          </p>
          <p className="font-condensed text-[13px] mt-1">
            <RateWord r={r} />
            {r.perDay != null && (
              <>
                {" · "}
                <PerDayNote r={r} daily={daily} withWord />
              </>
            )}
          </p>
          <p className="text-[13px] mt-1"><RungNote r={r} /></p>
        </div>
        <div>
          <p className="text-[12px] uppercase tracking-widest text-faint font-condensed">History</p>
          <p className="font-condensed font-semibold tabular-nums text-[26px] text-ink leading-none mt-1">
            {r.loadCount} load{r.loadCount === 1 ? "" : "s"}
          </p>
          <p className="text-[13px] text-dim mt-1">{historySub(r)}</p>
        </div>
        <div>
          <p className="text-[12px] uppercase tracking-widest text-faint font-condensed">Last spoken to</p>
          <p className={`font-condensed font-semibold tabular-nums text-[26px] leading-none mt-1 ${spoken.value === "—" ? "text-faint" : "text-ink"}`}>
            {spoken.value}
          </p>
          <p className="text-[13px] text-dim mt-1">{spoken.sub}</p>
        </div>
      </div>

      <Well className="px-3 py-2.5 flex items-center gap-3 flex-wrap">
        <span className="text-[12px] uppercase tracking-widest text-amber font-condensed shrink-0">Why</span>
        <span className="text-[14.5px] text-ink/90">{r.why}</span>
        <Link to={`/agents/${r.agentId}`} className="ml-auto font-condensed text-[13px] text-amber-hi hover:underline whitespace-nowrap">
          › the file
        </Link>
      </Well>
    </Panel>
  );
};

// ---- flat reading rows: #2..N ----
// ONE list, in score order. On a phone only the name and the miles survive —
// the two-column shape AgentRow uses everywhere else. On md+ six fields:
// # · agent · proximity · rate · history · spoken.
const ROW_GRID = "grid-cols-[minmax(0,1fr)_72px] md:grid-cols-[20px_minmax(0,1fr)_78px_96px_88px_64px]";

const RankedRow = ({
  r,
  rank,
  daily,
}: {
  r: AgentRanking;
  rank: number;
  daily: DailyTargets | null;
}) => {
  const spoken = spokenCell(r);
  return (
    <div className={`grid items-center gap-3 px-3.5 py-3 border-t border-hairline-lo ${ROW_GRID} ${r.avoid ? "opacity-60" : ""}`}>
      <span className="hidden md:block font-condensed font-semibold tabular-nums text-[18.5px] text-faint">{rank}</span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <Link to={`/agents/${r.agentId}`} className="font-condensed text-[16px] text-amber hover:text-hot transition-colors">
            {r.agentName}
          </Link>
          <RankCodeChip r={r} />
          <YourCall r={r} />
          {r.secondCall && <SecondCall />}
        </div>
        <div className="text-[12.5px] truncate">
          {r.isNew ? (
            <span className="font-condensed font-semibold uppercase tracking-wide" style={{ color: "var(--color-cat2)" }}>
              New {"·"} building
            </span>
          ) : (
            <span className="text-dim">{originSub(r)}</span>
          )}
        </div>
      </div>
      <span className="text-right leading-tight">
        <span className="font-condensed font-semibold tabular-nums text-[18.5px] text-ink block">{distanceLabel(r)}</span>
        <ProofWord r={r} />
      </span>
      <span className="hidden md:block text-right leading-tight">
        <span className="font-condensed font-semibold tabular-nums text-[18.5px] block">
          {r.rpm != null ? money2(r.rpm) : <span className="text-faint">{"—"}</span>}
          {r.rpm != null && <span className="font-condensed text-[12px] text-dim"> /mi</span>}
        </span>
        <span className="font-condensed text-[12px] block">
          <RateWord r={r} />
        </span>
        {r.perDay != null && (
          <span className="font-condensed text-[12px]">
            <PerDayNote r={r} daily={daily} />
          </span>
        )}
      </span>
      <span className="hidden md:block text-right leading-tight">
        <span className="font-condensed text-[14px] text-dim block">
          {r.loadCount} load{r.loadCount === 1 ? "" : "s"}
        </span>
        <span className="font-condensed text-[12px] text-faint">{historySub(r)}</span>
      </span>
      <span className="hidden md:block text-right leading-tight">
        <span className={`font-condensed font-semibold tabular-nums text-[14px] block ${spoken.value === "—" ? "text-faint" : "text-ink"}`}>
          {spoken.value}
        </span>
        <span className="font-condensed text-[11.5px] text-faint">{spoken.sub}</span>
      </span>
    </div>
  );
};

// The ranked rows under the Top Call — one list, score order, no groups.
const RankedList = ({
  rows,
  startRank,
  daily,
}: {
  rows: AgentRanking[];
  startRank: number;
  daily: DailyTargets | null;
}) => {
  if (rows.length === 0) return null;
  return (
    <div className="ds2-board mt-3">
      <div className={`hidden md:grid gap-3 px-3.5 pt-3 pb-1.5 ${ROW_GRID}`}>
        <span className="text-[12px] uppercase tracking-widest text-faint font-condensed">#</span>
        <span className="text-[12px] uppercase tracking-widest text-faint font-condensed">Agent · your call</span>
        <span className="text-[12px] uppercase tracking-widest text-faint font-condensed text-right">Proximity</span>
        <span className="text-[12px] uppercase tracking-widest text-faint font-condensed text-right">Rate</span>
        <span className="text-[12px] uppercase tracking-widest text-faint font-condensed text-right">History</span>
        <span className="text-[12px] uppercase tracking-widest text-faint font-condensed text-right">Spoken</span>
      </div>
      {rows.map((r, i) => (
        <RankedRow key={r.agentId} r={r} rank={startRank + i} daily={daily} />
      ))}
    </div>
  );
};

// ---- RATED 1 · BLACKLIST — your call, never ranked ----
// Listed under their own heading, nearest first, so you can see who is near
// the drop and why the Foreman is not offering them. The row opens the file,
// where the rating can be changed.
const BlacklistGroup = ({ rows }: { rows: AgentRanking[] }) => (
  <div className="ds2-board mt-3 overflow-hidden opacity-70">
    <SectionHead right={<span>your call — never ranked</span>}>
      Rated 1 · Blacklist · {rows.length}
    </SectionHead>
    {rows.map((r) => (
      <div key={r.agentId} className={`grid items-center gap-3 px-3.5 py-2.5 border-t border-hairline-lo ${ROW_GRID}`}>
        <span className="hidden md:block" />
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <Link to={`/agents/${r.agentId}`} className="font-condensed text-[15px] text-ink hover:text-amber transition-colors">
              {r.agentName}
            </Link>
            <RankCodeChip r={r} />
            <YourCall r={r} />
          </div>
          <div className="text-[12.5px] text-dim truncate">{originSub(r)}</div>
        </div>
        <span className="text-right font-condensed font-semibold tabular-nums text-[16px] text-ink">{distanceLabel(r)}</span>
        <span className="hidden md:block text-right font-condensed text-[13px] text-dim">
          {r.loadCount} load{r.loadCount === 1 ? "" : "s"}
        </span>
        <span className="hidden md:block" />
        <span className="hidden md:block text-right">
          <Link to={`/agents/${r.agentId}`} className="font-condensed text-[12.5px] text-amber-hi hover:underline whitespace-nowrap">
            › the file
          </Link>
        </span>
      </div>
    ))}
  </div>
);

// ---- PARKED · WITHIN 75 MI ----
// Your explicit parks, hidden from the ranked rows; when the truck goes empty
// near their freight they surface here, dimmed — grab their board freight.
// The row: name + code + PARKED; line 2 "{place} · {n} loads · parked —
// {reason}"; then "{mi} mi", "{n} · ${gross}", and the days since you last
// spoke, "—" when never or not known. The row opens the file.
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const parkedContext = (r: ParkedNearbyRow): string => {
  const place = `${r.place.city}, ${r.place.state}`;
  const loads = plural(r.delivered, "load");
  const worked = r.lastWorked ? ` · last worked ${shortDate(r.lastWorked)}` : "";
  return `${place} · ${loads}${worked} · parked — ${r.reason ?? "no reason written"}`;
};

const ParkedGroup = ({ anchor, rows, onOpen }: { anchor: Anchor; rows: ParkedNearbyRow[]; onOpen: (agentId: string) => void }) => (
  <div className="ds2-board mt-3 overflow-hidden opacity-70">
    <SectionHead right={<span>your parks — grab their board freight</span>}>
      Parked · within {PARKED_RADIUS_MILES} mi of {anchor.city}, {anchor.state} · {rows.length}
    </SectionHead>
    {rows.map((r) => (
      <AgentRow
        key={r.agent.agent_id}
        agent={r.agent}
        chip={{ kind: "parked", label: "Parked" }}
        context={parkedContext(r)}
        daysSince={r.daysSinceSpoken}
        daysCaption="since you spoke"
        neverCaption="call logged"
        right={{ value: r.daysSinceSpoken == null ? "—" : `${r.daysSinceSpoken}d`, caption: "since you spoke" }}
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
  <div className="ds2-board p-6">
    <p className="text-dim text-[14px]">Ranking…</p>
  </div>
);

const Empty = ({ msg }: { msg: string }) => (
  <div className="ds2-board px-4 py-6 text-dim text-[14px]">{msg}</div>
);

// The contact log and the stated markets — what "last spoken to" and the
// footprint read beyond loads and agents.
//
// `ready` = the log LANDED without error. Only then is it handed to the
// board; in flight, or after a failure, every row's "spoken" reads "—" and
// says the log didn't load — an empty array is never mistaken for "never
// called" on every desk. The error is kept, not swallowed, so the tab can
// name it; a refetch keeps the last good log on screen until the new one
// lands.
const useForemanBook = (refreshKey: number) => {
  const [contacts, setContacts] = useState<AgentContact[]>([]);
  const [coverage, setCoverage] = useState<AgentCoverage[]>([]);
  const [book, setBook] = useState<{ settled: boolean; error: string | null }>({ settled: false, error: null });
  // The clock the quiet days are counted against — refreshed with the book
  // so a tab left open does not keep yesterday's "since".
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
  const navigate = useNavigate();
  const [bookKey, setBookKey] = useState(0);
  const { loads, isLoading: loadsLoading } = useLoads(0);
  const { trips } = useTrips(0);
  const { agents, isLoading: agentsLoading } = useAgents(bookKey);
  const { contacts, coverage, now, loading: bookLoading, ready: contactsReady, error: contactsError } = useForemanBook(bookKey);
  // The claimed markets warm the coordinate cache alongside the loads —
  // decision 6A ranks a claim by real miles, which it can only do once that
  // city holds a coordinate.
  const coords = useCityCoords(loads, coverage);
  const targets = useRateTargets(loads);
  const ladders = useMemo(
    () => ({ standard: targets.bookingLadder, specialized: targets.specLadder }),
    [targets.bookingLadder, targets.specLadder],
  );

  const [focus, setFocus] = useState<LoadTypeFocus>("any");
  const [mode, setMode] = useState<ForemanMode>("balanced");

  // The contact log is handed over only once it has landed; until then every
  // row's "spoken" says the log didn't load rather than "never".
  const board = useMemo(
    () =>
      buildForemanBoard(loads, agents, coords, {
        focus,
        mode,
        contacts: contactsReady ? contacts : undefined,
        coverage,
        now,
        trips,
        ladders,
      }),
    [loads, agents, coords, focus, mode, contactsReady, contacts, coverage, now, trips, ladders],
  );
  const parked = useMemo(
    () => parkedNearby(agents, loads, coverage, coords, board.anchor, contactsReady ? contacts : null, now),
    [contactsReady, agents, loads, coverage, coords, board.anchor, contacts, now],
  );

  // First paint waits for the book too, so the rankings never race the log.
  if (loadsLoading || agentsLoading || bookLoading) return <Loading />;
  if (!board.anchor)
    return <Empty msg="No committed or delivered loads yet — add a load and the Foreman will tell you who to call." />;

  const [top, ...rest] = board.rankings;
  const anchorHint =
    board.anchor.source === "committed" ? "after your booked load delivers" : "empty here now";
  const openFile = (agentId: string) => navigate(`/agents/${agentId}`);
  const parkedGroup = parked.length > 0 ? <ParkedGroup anchor={board.anchor} rows={parked} onOpen={openFile} /> : null;
  const blacklistGroup = board.blacklisted.length > 0 ? <BlacklistGroup rows={board.blacklisted} /> : null;

  return (
    <div>
      {/* controls */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[12px] uppercase tracking-widest text-faint font-condensed">Looking for</span>
          <SegmentedTabs size="sm" tabs={FOCUS_TABS} value={focus} onChange={setFocus} ariaLabel="Load type focus" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] uppercase tracking-widest text-faint font-condensed">Rank by</span>
          <SegmentedTabs size="sm" tabs={MODE_TABS} value={mode} onChange={setMode} ariaLabel="Rank by" />
        </div>
      </div>

      {contactsError && (
        <AlertLamp category="contacts" className="mb-4">
          contact log didn't load — "last spoken to" is blank on every row; the ranked order is unaffected ·{" "}
          <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => setBookKey((k) => k + 1)}>
            retry
          </button>
        </AlertLamp>
      )}

      {/* anchor */}
      <div className="ds2-board flex items-center gap-3 px-4 py-3 mb-4">
        <span className="text-amber text-[16px]">{"◉"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] uppercase tracking-widest text-faint font-condensed">Empty next</p>
          <p className="font-condensed text-[19.5px] font-semibold text-ink leading-tight">
            {board.anchor.city}, {board.anchor.state}
            <span className="text-dim font-normal text-[13px] ml-2">{anchorHint}</span>
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
          {blacklistGroup}
        </>
      ) : (
        <>
          {/* top call */}
          {top && <TopCall r={top} daily={targets.gross} />}

          {/* the rest — ONE list, in the score's own order */}
          <RankedList rows={rest} startRank={2} daily={targets.gross} />

          {/* parked within 75 mi, then the blacklist — under the ranked rows, dimmed */}
          {parkedGroup}
          {blacklistGroup}

          {/* footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3 px-1">
            <p className="text-[12.5px] text-faint max-w-xl">
              One list, in score order: straight-line distance to where you'll be empty — from a market a
              load proved or one they claimed on a call — the rate a driven mile against the rung for their
              freight, in the Scorer's words, and your history. Your rating is printed on every row and
              breaks ties; a desk you rated 1 is never ranked. A call list from who you've booked or who
              told you where their freight is, not a live load feed.
              {board.coverage.withCoords < board.coverage.total &&
                " Distances sharpen to real miles as new cities finish geocoding."}
            </p>
            <Link to="/guide" className="font-condensed text-[13.5px] text-dim hover:text-ink whitespace-nowrap">
              How it's ranked {"→"}
            </Link>
          </div>
        </>
      )}
    </div>
  );
};
