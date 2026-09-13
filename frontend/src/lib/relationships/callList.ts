// The Call list — the Reactivation Gameplan's target list (§3) and the
// prospecting list (ADMIN-02 §5C), on REL-01 v2.0's buckets. Pure and clock
// injected; the views only draw what comes out.
//
//   marketGrades     A / B / C by average gross per delivered load, by origin
//                    state, trailing 12 months, states with two or more loads
//                    ranked — top third A, middle third B, the rest C.
//   reactivationList Prospects who HAULED and went quiet: no two-way contact
//                    and no load in 42 days, no callback owed. Grouped by the
//                    grade of their top market, ranked warmest first (volume
//                    and recency), unreached calls sink a row, three unreached
//                    calls in two weeks recycle it to the next rotation. THIS
//                    ROTATION (`rotation`) is the graded groups only — the
//                    advance order and every count read it; the recycle fold
//                    is listed, never counted.
//   prospectsList    Prospects who never ran — new · touched ×n · replied.
//   holidayList      the active book inside a holiday window (REL-01 §5D),
//                    minus everyone already wished this holiday-year — the
//                    third Working tab, on PR 2's holidays.ts.
//   classLabel       the one chip a row wears for the one question — the
//                    owner's pin, evidence, or "not yet asked"; never a default.
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import type { AgentContact } from "@/services/agentContactsService";
import type { AgentCoverage } from "@/services/agentCoverageService";
import { effectiveAgentClass, type AgentScorecard } from "@/lib/metrics/agentScorecard";
import { originMarketsByAgent } from "@/lib/metrics/agentTouches";
import { loadGross } from "@/lib/metrics/rateTargets";
import { money } from "@/lib/format";
import { bucketOf, type BookCtx, type Bucket } from "./buckets";
import { capStatus, type CapStatus } from "./contactCap";
import { activeHoliday, holidayFlags, HOLIDAY_LABEL, type HolidayWindow } from "./holidays";
import type { MarkerNoteLike } from "./markers";
import { lastLoadKey } from "./agentRpm";
import { lastMeaningfulContact } from "./meaningfulContact";
import { DAY_MS, daysBetweenKeys, keyOf, localDayKey, shortDate, utcDayKey } from "./dayKeys";
import { nameOf } from "./nameOf";

// ---- market grades ----
export type MarketGrade = "A" | "B" | "C";
export const GRADES: readonly MarketGrade[] = ["A", "B", "C"];
export const GRADE_WINDOW_DAYS = 365;
export const GRADE_MIN_LOADS = 2;
export const GRADE_BASIS = "by avg revenue per delivered load, 12 months, min 2 loads";

export interface MarketGrades {
  byState: Map<string, MarketGrade>; // ranked states only; anything else reads C
  a: string[]; // best first
  b: string[];
  ranked: number; // states with ≥2 delivered loads inside the window
  caption: string; // generated — "A = IN, GA · B = TX · C = everyone else · by avg …"
}

const stateKey = (s: string | null | undefined): string => String(s ?? "").trim().toUpperCase();

export const marketGrades = (loads: Load[], now: Date): MarketGrades => {
  const toKey = utcDayKey(now);
  const fromKey = utcDayKey(new Date(now.getTime() - GRADE_WINDOW_DAYS * DAY_MS));
  const acc = new Map<string, { gross: number; n: number }>();
  for (const l of loads) {
    if (l.load_status !== "delivered" || !l.pickup_date) continue;
    const k = keyOf(l.pickup_date);
    if (k < fromKey || k > toKey) continue;
    const st = stateKey(l.origin_state);
    if (!st) continue;
    const cur = acc.get(st) ?? { gross: 0, n: 0 };
    cur.gross += loadGross(l);
    cur.n += 1;
    acc.set(st, cur);
  }
  const ranked = [...acc.entries()]
    .filter(([, v]) => v.n >= GRADE_MIN_LOADS)
    .map(([state, v]) => ({ state, avg: v.gross / v.n }))
    .sort((x, y) => y.avg - x.avg || x.state.localeCompare(y.state));
  const n = ranked.length;
  const byState = new Map<string, MarketGrade>();
  const a: string[] = [];
  const b: string[] = [];
  ranked.forEach((r, i) => {
    const g: MarketGrade = i < n / 3 ? "A" : i < (2 * n) / 3 ? "B" : "C";
    byState.set(r.state, g);
    if (g === "A") a.push(r.state);
    else if (g === "B") b.push(r.state);
  });
  const caption =
    n === 0
      ? `no market grades yet — a state needs ${GRADE_MIN_LOADS} delivered loads in 12 months · everyone is C`
      : [a.length ? `A = ${a.join(", ")}` : null, b.length ? `B = ${b.join(", ")}` : null, "C = everyone else", GRADE_BASIS]
          .filter((s): s is string => s != null)
          .join(" · ");
  return { byState, a, b, ranked: n, caption };
};

export const gradeOf = (grades: MarketGrades, state: string | null | undefined): MarketGrade =>
  grades.byState.get(stateKey(state)) ?? "C";

// ---- the footprint six (Gameplan §6 ④) ----
export const FOOTPRINT_QUESTIONS = 6;
// Answers to questions 3–5 fold into the contact note under these prefixes.
export const FOOTPRINT_MARKERS = { lane: "[lane]", regular: "[regular]", season: "[season]" } as const;

export interface FootprintParts {
  markets: boolean; // a market on file — stated on a call, or proven by a load
  freight: boolean; // ≥1 freight type
  bestTime: boolean; // best time to call
  lane: boolean; // a [lane] note
  regular: boolean; // a [regular] note
  season: boolean; // a [season] note
}

// Which of the three note markers this agent's contacts already carry.
export const noteMarkers = (
  agentId: string,
  contacts: Pick<AgentContact, "agent_id" | "note">[],
): Pick<FootprintParts, "lane" | "regular" | "season"> => {
  const out = { lane: false, regular: false, season: false };
  for (const c of contacts) {
    if (c.agent_id !== agentId || !c.note) continue;
    const n = c.note.toLowerCase();
    if (n.includes(FOOTPRINT_MARKERS.lane)) out.lane = true;
    if (n.includes(FOOTPRINT_MARKERS.regular)) out.regular = true;
    if (n.includes(FOOTPRINT_MARKERS.season)) out.season = true;
  }
  return out;
};

export const footprintParts = (
  agent: Pick<Agent, "agent_id" | "freight_types" | "best_time_to_call">,
  statedMarkets: number,
  provenMarkets: number,
  contacts: Pick<AgentContact, "agent_id" | "note">[],
): FootprintParts => ({
  markets: statedMarkets + provenMarkets > 0,
  freight: (agent.freight_types?.length ?? 0) > 0,
  bestTime: !!agent.best_time_to_call?.trim(),
  ...noteMarkers(agent.agent_id, contacts),
});

export const footprintScore = (p: FootprintParts): number =>
  [p.markets, p.freight, p.bestTime, p.lane, p.regular, p.season].filter(Boolean).length;

// ---- call history (what the dialing record says) ----
export const QUIET_DAYS = 42;
export const UNREACHED_WINDOW_DAYS = 14;
export const RECYCLE_AT = 3;
const UNREACHED = new Set(["voicemail", "no_answer", "bad_number"]);

export interface CallHistory {
  unreachedAttempts: number; // voicemail / no answer / bad number in the last 14 days
  sank: boolean; // the last call, inside 14 days, was voicemail or no answer
  badNumber: boolean; // the latest call came back bad number
  everCalled: boolean;
  lastReached: string | null; // 'YYYY-MM-DD'
  openCallback: boolean; // the latest contact promises a callback today or later
}

export const callHistory = (
  agentId: string,
  contacts: Pick<AgentContact, "agent_id" | "contacted_at" | "direction" | "method" | "outcome" | "next_step_at">[],
  now: Date,
): CallHistory => {
  const nowKey = utcDayKey(now);
  // next_step_at was picked from LOCAL calendar chips — compare against
  // Brandie's today, not UTC's.
  const todayLocal = localDayKey(now);
  let latest: (typeof contacts)[number] | null = null;
  let latestCall: (typeof contacts)[number] | null = null;
  let unreached = 0;
  let everCalled = false;
  let lastReached: string | null = null;
  for (const c of contacts) {
    if (c.agent_id !== agentId) continue;
    if (!latest || c.contacted_at > latest.contacted_at) latest = c;
    if (c.direction !== "outbound" || c.method !== "call") continue;
    everCalled = true;
    if (!latestCall || c.contacted_at > latestCall.contacted_at) latestCall = c;
    const k = keyOf(c.contacted_at);
    if (c.outcome === "reached" && (!lastReached || k > lastReached)) lastReached = k;
    if (c.outcome && UNREACHED.has(c.outcome) && daysBetweenKeys(k, nowKey) <= UNREACHED_WINDOW_DAYS) unreached++;
  }
  const recentCall = latestCall != null && daysBetweenKeys(keyOf(latestCall.contacted_at), nowKey) <= UNREACHED_WINDOW_DAYS;
  return {
    unreachedAttempts: unreached,
    sank: recentCall && (latestCall?.outcome === "voicemail" || latestCall?.outcome === "no_answer"),
    badNumber: latestCall?.outcome === "bad_number",
    everCalled,
    lastReached,
    openCallback: latest?.next_step_at != null && keyOf(latest.next_step_at) >= todayLocal,
  };
};

// ---- the reactivation list ----
export interface ReactivationRow {
  agent: Agent;
  grade: MarketGrade;
  topMarket: { city: string; state: string } | null; // most frequent delivered origin, else where they sit
  delivered: number;
  gross: number; // Σ gross over delivered loads
  avgGross: number; // per delivered load
  lastLoad: string | null;
  daysQuiet: number; // since the later of the last two-way contact and the last load
  unreachedAttempts: number;
  footprint: FootprintParts;
  footprintScore: number;
  sank: boolean;
  recycle: boolean;
  badNumber: boolean;
  why: string; // the rank reason — "1 load worth $6,704, 65 days since, never called — a warm re-open"
}

export interface ReactivationList {
  groups: Record<MarketGrade, ReactivationRow[]>;
  recycle: ReactivationRow[];
  // THIS ROTATION — A, B, C in call order. The advance, the tab count and the
  // statusbar suffix read this; a row in the recycle fold is never next and
  // never counted (it re-enters on its own after 42 quiet days).
  rotation: ReactivationRow[];
  all: ReactivationRow[]; // display order: the rotation, then the recycle fold
}

const byAgentName = (x: { agent: Agent }, y: { agent: Agent }): number =>
  nameOf(x.agent).localeCompare(nameOf(y.agent));

// Within a grade: 0.6 · volume rank + 0.4 · recency rank, lower first (rank =
// position in the group; more loads = warmer, a more recent last load = an
// easier re-open). Rows whose last call in two weeks went unanswered sink to
// the end of the group — still listed, never hidden.
const rankGroup = (rows: ReactivationRow[]): ReactivationRow[] => {
  const volume = [...rows].sort((x, y) => y.delivered - x.delivered || byAgentName(x, y));
  const recency = [...rows].sort((x, y) => (y.lastLoad ?? "").localeCompare(x.lastLoad ?? "") || byAgentName(x, y));
  const vRank = new Map(volume.map((r, i) => [r.agent.agent_id, i]));
  const rRank = new Map(recency.map((r, i) => [r.agent.agent_id, i]));
  const score = (r: ReactivationRow) => 0.6 * (vRank.get(r.agent.agent_id) ?? 0) + 0.4 * (rRank.get(r.agent.agent_id) ?? 0);
  return [...rows].sort((x, y) => Number(x.sank) - Number(y.sank) || score(x) - score(y) || byAgentName(x, y));
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const whyLine = (r: Omit<ReactivationRow, "why">, h: CallHistory): string => {
  const calls = h.badNumber
    ? "the number on file bounced"
    : h.unreachedAttempts > 0
      ? `${plural(h.unreachedAttempts, "unreached call")} in two weeks`
      : h.lastReached
        ? `last reached ${shortDate(h.lastReached)}`
        : h.everCalled
          ? "called before"
          : "never called";
  const tail =
    r.grade === "A" ? "a warm re-open in a priority market" : r.grade === "B" ? "a warm re-open" : "a warm re-open in a thin market";
  return `${plural(r.delivered, "load")} worth ${money(r.gross)}, ${r.daysQuiet} days since, ${calls} — ${tail}`;
};

export const reactivationList = (
  agents: Agent[],
  loads: Load[],
  contacts: AgentContact[],
  coverage: Pick<AgentCoverage, "agent_id">[],
  now: Date,
  grades: MarketGrades,
  // false while the loads slice is in flight or failed: the buckets then make
  // no dormancy verdict (lib/relationships/buckets), and the view shows "—".
  loadsReady = true,
): ReactivationList => {
  const nowKey = utcDayKey(now);
  const ctx = { loads, contacts, now, loadsReady };
  const deliveredBy = new Map<string, Load[]>();
  for (const l of loads) {
    if (!l.agent_id || l.load_status !== "delivered") continue;
    (deliveredBy.get(l.agent_id) ?? deliveredBy.set(l.agent_id, []).get(l.agent_id)!).push(l);
  }
  const stated = new Map<string, number>();
  for (const c of coverage) stated.set(c.agent_id, (stated.get(c.agent_id) ?? 0) + 1);

  const groups: Record<MarketGrade, ReactivationRow[]> = { A: [], B: [], C: [] };
  const recycle: ReactivationRow[] = [];
  for (const agent of agents) {
    // Prospects only — a tier is the owner's call and rides the nurture
    // method; Parked (explicit or dormant) is out of every list.
    if (bucketOf(agent, ctx) !== "prospect") continue;
    const mine = deliveredBy.get(agent.agent_id) ?? [];
    if (mine.length === 0) continue;
    // Quiet = nothing two-way (a reached call, anything inbound, a load picked
    // up or delivered — a booked load counts as now) inside 42 days. The LATER
    // of pickup and delivery is the load's day on purpose: a delivery is a
    // load event, the same reading PR 1's meaningfulContact gives it.
    const last = lastMeaningfulContact(agent.agent_id, contacts, loads) ?? (agent.created_at ? keyOf(agent.created_at) : null);
    const daysQuiet = last ? Math.max(0, daysBetweenKeys(last, nowKey)) : QUIET_DAYS + 1;
    if (daysQuiet <= QUIET_DAYS) continue;
    const history = callHistory(agent.agent_id, contacts, now);
    if (history.openCallback) continue; // a promised callback belongs to Today, not the list

    const top = originMarketsByAgent(mine).get(agent.agent_id)?.[0] ?? null;
    const topMarket = top
      ? { city: top.city, state: top.state }
      : agent.agent_city
        ? { city: agent.agent_city, state: agent.agent_state ?? "" }
        : null;
    const gross = mine.reduce((s, l) => s + loadGross(l), 0);
    const footprint = footprintParts(agent, stated.get(agent.agent_id) ?? 0, top ? 1 : 0, contacts);
    const base: Omit<ReactivationRow, "why"> = {
      agent,
      grade: gradeOf(grades, top?.state ?? agent.agent_state),
      topMarket,
      delivered: mine.length,
      gross,
      avgGross: gross / mine.length,
      lastLoad: lastLoadKey(loads, agent.agent_id),
      daysQuiet,
      unreachedAttempts: history.unreachedAttempts,
      footprint,
      footprintScore: footprintScore(footprint),
      sank: history.sank,
      recycle: history.unreachedAttempts >= RECYCLE_AT,
      badNumber: history.badNumber,
    };
    const row: ReactivationRow = { ...base, why: whyLine(base, history) };
    (row.recycle ? recycle : groups[row.grade]).push(row);
  }
  for (const g of GRADES) groups[g] = rankGroup(groups[g]);
  const gradeRank = (g: MarketGrade) => GRADES.indexOf(g);
  recycle.sort((x, y) => gradeRank(x.grade) - gradeRank(y.grade) || y.unreachedAttempts - x.unreachedAttempts || byAgentName(x, y));
  const rotation = [...groups.A, ...groups.B, ...groups.C];
  return { groups, recycle, rotation, all: [...rotation, ...recycle] };
};

// ---- the prospects list ----
export type ProspectStage = "new" | "touched" | "replied";
export const CONVERTED_WINDOW_DAYS = 90;

export const SOURCE_LABELS: Record<string, string> = {
  load_board: "load board",
  referral: "referral",
  directory: "directory",
  saw_freight: "saw their freight",
  other: "other",
};
export const sourceLabel = (source: string | null | undefined): string | null =>
  source ? SOURCE_LABELS[source] ?? source : null;

export interface ProspectRow {
  agent: Agent;
  stage: ProspectStage;
  stageLabel: string; // "New" · "Touched ×2" · "Replied"
  touches: number; // outbound contacts
  lastTouch: string | null; // ISO of the latest contact, either direction
  daysQuiet: number | null; // since the latest contact; null = never touched
  grade: MarketGrade; // of where they sit — for the Market filter only
  place: string | null; // "Boise, ID"
  sourceLabel: string | null;
  footprint: FootprintParts;
  footprintScore: number;
  badNumber: boolean;
  unreachedAttempts: number;
  why: string;
}

export interface ProspectsList {
  rows: ProspectRow[];
  counts: { prospects: number; touched: number; replied: number; converted: number };
  head: string; // "n prospects · k touched · j replied · c converted"
}

const STAGE_RANK: Record<ProspectStage, number> = { replied: 0, touched: 1, new: 2 };

// Converted = an agent whose FIRST delivered load landed inside the last 90
// days — whatever bucket they sit in now.
export const convertedCount = (loads: Load[], now: Date): number => {
  const nowKey = utcDayKey(now);
  const first = new Map<string, string>();
  for (const l of loads) {
    if (!l.agent_id || l.load_status !== "delivered") continue;
    const raw = l.delivery_date ?? l.pickup_date;
    if (!raw) continue;
    const k = keyOf(raw);
    const cur = first.get(l.agent_id);
    if (cur == null || k < cur) first.set(l.agent_id, k);
  }
  let n = 0;
  for (const k of first.values()) {
    const d = daysBetweenKeys(k, nowKey);
    if (d >= 0 && d <= CONVERTED_WINDOW_DAYS) n++;
  }
  return n;
};

export const prospectsList = (
  agents: Agent[],
  loads: Load[],
  contacts: AgentContact[],
  now: Date,
  coverage: Pick<AgentCoverage, "agent_id">[] = [],
  grades: MarketGrades = marketGrades(loads, now),
  loadsReady = true, // as reactivationList — no dormancy verdict without loads
): ProspectsList => {
  const nowKey = utcDayKey(now);
  const ctx = { loads, contacts, now, loadsReady };
  const hasDelivered = new Set<string>();
  for (const l of loads) if (l.agent_id && l.load_status === "delivered") hasDelivered.add(l.agent_id);
  const stated = new Map<string, number>();
  for (const c of coverage) stated.set(c.agent_id, (stated.get(c.agent_id) ?? 0) + 1);

  const rows: ProspectRow[] = [];
  for (const agent of agents) {
    if (hasDelivered.has(agent.agent_id) || bucketOf(agent, ctx) !== "prospect") continue;
    let touches = 0;
    let replied = false;
    let lastTouch: string | null = null;
    for (const c of contacts) {
      if (c.agent_id !== agent.agent_id) continue;
      if (c.direction === "inbound") replied = true;
      else touches++;
      if (!lastTouch || c.contacted_at > lastTouch) lastTouch = c.contacted_at;
    }
    const stage: ProspectStage = replied ? "replied" : touches > 0 ? "touched" : "new";
    const stageLabel = stage === "replied" ? "Replied" : stage === "touched" ? `Touched ×${touches}` : "New";
    const history = callHistory(agent.agent_id, contacts, now);
    const footprint = footprintParts(agent, stated.get(agent.agent_id) ?? 0, 0, contacts);
    const place = agent.agent_city ? `${agent.agent_city}${agent.agent_state ? `, ${agent.agent_state}` : ""}` : null;
    const src = sourceLabel(agent.source);
    const added = agent.created_at ? shortDate(keyOf(agent.created_at)) : null;
    const why =
      `${stageLabel} · via ${src ?? "unknown source"}${added ? ` · added ${added}` : ""} — ` +
      (stage === "replied"
        ? "they came to you; keep the momentum"
        : stage === "touched"
          ? "no reply yet; a different channel beats another dial"
          : "a first call: lead with capacity, not an ask");
    rows.push({
      agent,
      stage,
      stageLabel,
      touches,
      lastTouch,
      daysQuiet: lastTouch ? Math.max(0, daysBetweenKeys(keyOf(lastTouch), nowKey)) : null,
      grade: gradeOf(grades, agent.agent_state),
      place,
      sourceLabel: src,
      footprint,
      footprintScore: footprintScore(footprint),
      badNumber: history.badNumber,
      unreachedAttempts: history.unreachedAttempts,
      why,
    });
  }
  // Replied first, then touched — oldest last touch first (who has waited
  // longest) — then new, freshest record first.
  rows.sort((x, y) => {
    const s = STAGE_RANK[x.stage] - STAGE_RANK[y.stage];
    if (s !== 0) return s;
    if (x.stage === "new") return (y.agent.created_at ?? "").localeCompare(x.agent.created_at ?? "") || byAgentName(x, y);
    return (x.lastTouch ?? "").localeCompare(y.lastTouch ?? "") || byAgentName(x, y);
  });
  const counts = {
    prospects: rows.length,
    touched: rows.filter((r) => r.stage !== "new").length,
    replied: rows.filter((r) => r.stage === "replied").length,
    converted: convertedCount(loads, now),
  };
  return {
    rows,
    counts,
    head: `${plural(counts.prospects, "prospect")} · ${counts.touched} touched · ${counts.replied} replied · ${counts.converted} converted`,
  };
};

// ---- the holiday working list (REL-01 v2.0 §5D) ----
// One note per active agent per holiday-year, only inside the window PR 2's
// lib/relationships/holidays draws — Thanksgiving from ten days before through
// the day, New Year from Dec 22 through Jan 2. The ACTIVE BOOK is the tiers
// and the prospects; Parked, explicit or dormant-derived, is on no list.
// Everyone whose record already carries this holiday-year's marker is out —
// sent (the token in a contact note, its own or folded) or skipped (the token
// in an agent note) — which is exactly `holidayFlags`, so the "is this one
// still open" rule has ONE implementation, shared with Today's nurture plate.
// Tier 1 first: those are the ones the owner personalizes, and the order is
// the order they should be written in.
// Each row carries the week's cap status, so the list can wear the "Touched
// {Day}" chip before the note is opened. Nothing here decides the cap's DOORS
// — the agent sheet's LogTouchForm does, by method (touchOptions.capDoors): a
// holiday note sent as a message can fold into the week's message.
export type ActiveBucket = Exclude<Bucket, "parked">;

export interface HolidayRow {
  agent: Agent;
  bucket: ActiveBucket;
  marker: string; // "[holiday:thanksgiving-2026]" — the token the note carries
  cap: CapStatus<AgentContact>; // blocked = a proactive touch already went out this week
}

export interface HolidayList {
  window: HolidayWindow | null; // null = outside every window: no tab, no rows
  label: string | null; // "Thanksgiving" · "New Year"
  rows: HolidayRow[];
}

const ACTIVE_BUCKET_RANK: Record<ActiveBucket, number> = { tier1: 0, tier2: 1, tier3: 2, prospect: 3 };

export const holidayList = (
  agents: Agent[],
  contacts: AgentContact[],
  // A skip is recorded as an agent NOTE, never a contact — a skip is not a
  // touch — so the notes are read here too, the way holidayFlags reads them.
  notes: MarkerNoteLike[],
  now: Date,
  ctx: BookCtx,
): HolidayList => {
  const window = activeHoliday(now);
  if (!window) return { window: null, label: null, rows: [] };
  const bucket = new Map<string, ActiveBucket>();
  const active: Agent[] = [];
  for (const agent of agents) {
    const b = bucketOf(agent, ctx);
    if (b === "parked") continue;
    bucket.set(agent.agent_id, b);
    active.push(agent);
  }
  const rows = holidayFlags(active, contacts, notes, now)
    .map((f) => ({
      agent: f.agent,
      bucket: bucket.get(f.agent.agent_id)!,
      marker: f.marker,
      cap: capStatus(f.agent.agent_id, contacts, now),
    }))
    .sort((x, y) => ACTIVE_BUCKET_RANK[x.bucket] - ACTIVE_BUCKET_RANK[y.bucket] || byAgentName(x, y));
  return { window, label: HOLIDAY_LABEL[window.kind], rows };
};

// ---- the class chip ----
export type ClassWord = "Direct" | "Spot" | "Unclear" | "Not yet asked";
export interface ClassChip {
  label: ClassWord;
  pinned: boolean; // the owner / dispatch answered the one question
  derived: boolean; // read off repeat facilities, not asked
}

// What a row says about the one question. The pin wins; 'unclear' is an
// answer of its own. Without a pin, an auto 'direct' rests on evidence — a
// facility that repeated in the same role — and reads Direct; an auto 'spot'
// is only the ABSENCE of that evidence, so it is not a class at all: nobody
// has asked yet. Never "spot · auto" on a one-load stranger.
export const classLabel = (agent: Agent, card: AgentScorecard | undefined): ClassChip => {
  if (agent.agent_class === "unclear") return { label: "Unclear", pinned: true, derived: false };
  const eff = effectiveAgentClass(agent, card);
  if (eff.source === "pinned") return { label: eff.bucket === "direct" ? "Direct" : "Spot", pinned: true, derived: false };
  if (eff.bucket === "direct" && (card?.repeatCustomers.length ?? 0) > 0) return { label: "Direct", pinned: false, derived: true };
  return { label: "Not yet asked", pinned: false, derived: false };
};

// ---- the statusbar's numbers ----
export interface CallListSummary {
  lapsed: number;
  prospects: number;
  caption: string;
}

export const callListSummary = (
  agents: Agent[],
  loads: Load[],
  contacts: AgentContact[],
  coverage: Pick<AgentCoverage, "agent_id">[],
  now: Date,
): CallListSummary => {
  const grades = marketGrades(loads, now);
  return {
    // This rotation only — a recycled row sits in the fold, not in the number.
    lapsed: reactivationList(agents, loads, contacts, coverage, now, grades).rotation.length,
    prospects: prospectsList(agents, loads, contacts, now, coverage, grades).rows.length,
    caption: grades.caption,
  };
};
