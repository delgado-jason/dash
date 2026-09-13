// THE REVIEW's derivations (REL-01 v2.0 §5H) — everything /relationships/review
// judges, computed here so the page only draws. Pure and clock-injected: no
// Date.now(), no formatting decisions, null for "no data" (the view prints the
// dash). The doctrine the module encodes:
//   * dash SUGGESTS a tier; the OWNER approves it with a written reason. A
//     suggestion the owner HELD stays quiet until the evidence behind it moves.
//   * cooling is monitoring, never a task — it is read straight from
//     lib/relationships/cooling and only counted here.
//   * nothing re-tiers, parks or prunes itself; every list below is a list of
//     things to LOOK at.
import type { Load } from "@/types/load";
import { bookedInWindow, shareOf, type InboundShare } from "@/lib/metrics/relationships";
import { loadGross, loadNetRevenue, type RateLadder } from "@/lib/metrics/rateTargets";
import { rpmGrade, type Grade } from "@/lib/metrics/playerCard";
import { reviewWindow, type ReviewWindow } from "@/lib/metrics/monthlyReview";
import { MONTHS, rangeFor, resolvePeriod, type RecapRange } from "@/lib/metrics/recap";
import { currentRange } from "@/lib/metrics/dispatcherSeason";
import { agentAllInRpm, deliveredCount, lastLoadKey } from "./agentRpm";
import { bucketOf, partitionBook, type BookAgentLike, type BookCtx, type Bucket } from "./buckets";
import {
  ESTABLISHED_AT,
  bandLabel,
  isEstablished,
  suggestBucket,
  suggestionLabel,
  type BucketSuggestion,
} from "./tierSuggestion";
import { lastMeaningfulContact } from "./meaningfulContact";
import { proactiveTouchesThisWeek, weekKey } from "./contactCap";
import { daysBetweenKeys, keyOf, localDayKey, utcDayKey, weekdayShort } from "./dayKeys";
import { milestoneFlags, type MilestoneFlag } from "./milestones";
import { markersOf } from "./markers";
import { hygiene, type HygieneItem } from "./fridayFive";
import { coolingSection, type CoolingSection } from "./cooling";
import { nameOf } from "./nameOf";

// The bucket in words — every board and the report print it the same way.
export const bucketWord = (b: Bucket): string =>
  b === "tier1" ? "Tier 1" : b === "tier2" ? "Tier 2" : b === "tier3" ? "Tier 3" : b === "prospect" ? "Prospect" : "Parked";

// ---------------------------------------------------------------------------
// the shapes
// ---------------------------------------------------------------------------

export interface ReviewAgentLike extends BookAgentLike {
  broker_name?: string | null;
  phone?: string | null;
  preferred_contact: string | null;
  best_time_to_call?: string | null;
}

export interface ReviewContactLike {
  contact_id?: string;
  agent_id: string;
  contacted_at: string; // ISO
  direction: "outbound" | "inbound";
  method: string;
  type: string;
  note?: string | null;
  outcome?: string | null;
  cap_override?: boolean | null;
}

export interface ReviewNoteLike {
  agent_id: string;
  note: string;
}

export interface ReviewCoverageLike {
  agent_id: string;
  city: string;
  state: string;
}

// agent_tier_history, as the API hands it back (agentTierHistoryService).
export interface TierHistoryLike {
  history_id: string;
  agent_id: string;
  from_tier: number | null;
  to_tier: number | null;
  reason: string;
  changed_at: string; // ISO
  first_name?: string;
  last_name?: string;
  broker_name?: string | null;
  changed_by_name?: string | null;
}

// relationship_reviews, as the API hands it back.
export interface SignedPeriodLike {
  period_key: string; // 'YYYY-MM' | 'YYYY-Qn'
  kind: "month" | "quarter";
  targets: string | null;
  reviewed_at: string; // ISO
  reviewed_by_name?: string | null;
}

// ---------------------------------------------------------------------------
// 0. the period the stepper is pointing at
// ---------------------------------------------------------------------------
// `ago` 0 is the IN-PROGRESS month / quarter (dispatcherSeason's currentRange);
// 1 and up walk back through finished ones (recap's resolvePeriod, whose own 0
// is the last COMPLETE period). The evidence every board rests on is always the
// 90 days ending with the period — clamped to today, so an in-progress month is
// never judged on days that have not happened.

export type ReviewScope = "month" | "quarter";

export interface ReviewPeriod {
  scope: ReviewScope;
  ago: number;
  range: RecapRange; // the period itself — [start, end)
  key: string; // 'YYYY-MM' for a month · 'YYYY-Qn' for a quarter
  label: string; // "SEP ’26" · "Q3 ’26" — the stepper's word
  name: string; // "September" · "Q3" — the sentence's word
  inProgress: boolean;
  win: ReviewWindow; // the 90 days the scorecard and the suggestions judge on
}

const lastMonthOfRange = (r: RecapRange): string => {
  // [start, end) — the last month inside it is the month before `end`.
  const d = new Date(r.end.getTime());
  d.setUTCDate(0); // the last day of the previous month
  return utcDayKey(d).slice(0, 7);
};

export const quarterKeyOf = (d: Date): string =>
  `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;

export const reviewPeriod = (scope: ReviewScope, ago: number, now: Date): ReviewPeriod => {
  const range = ago === 0 ? currentRange(scope, now) : resolvePeriod(scope, ago - 1, now);
  const key = scope === "month" ? utcDayKey(range.start).slice(0, 7) : quarterKeyOf(range.start);
  const name =
    scope === "month"
      ? new Date(range.start).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })
      : `Q${Math.floor(range.start.getUTCMonth() / 3) + 1}`;
  const label =
    scope === "month"
      ? `${MONTHS[range.start.getUTCMonth()].toUpperCase()} ’${String(range.start.getUTCFullYear()).slice(2)}`
      : `${name} ’${String(range.start.getUTCFullYear()).slice(2)}`;
  return {
    scope,
    ago,
    range,
    key,
    label,
    name,
    inProgress: ago === 0,
    win: reviewWindow(lastMonthOfRange(range), now),
  };
};

// The months a quarter holds, as 'YYYY-MM' — what MONTHS SIGNED counts.
export const monthKeysOf = (r: RecapRange): string[] => {
  const out: string[] = [];
  for (let d = new Date(r.start); d.getTime() < r.end.getTime(); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    out.push(utcDayKey(d).slice(0, 7));
  }
  return out;
};

export const monthWord = (monthKey: string): string =>
  MONTHS[Number(monthKey.slice(5, 7)) - 1] ?? monthKey;

// ---------------------------------------------------------------------------
// 1. IS IT WORKING — inbound share, by the agent's CURRENT bucket
// ---------------------------------------------------------------------------
// Attributed = a booked_via on a non-cancelled load picked up inside the
// window. Legacy (pre-system) loads carry no attribution and sit outside every
// denominator — never counted as "we chased it".

// The fraction and the window filter are lib/metrics/relationships' — the ONE
// definition of "attributed" — imported rather than re-spelled here. null when
// nothing is attributed: never a 0% bar for "we have no evidence".
export type Share = InboundShare;

export const attributedIn = bookedInWindow;

export interface InboundCut {
  all: Share;
  tier1: Share;
  tier2: Share;
  tier3: Share;
  prospects: Share; // untiered — excluded from the three tier cells, named in the sub
}

// The cut by CURRENT bucket (v2), not by the stored tier: an untiered agent is
// a Prospect, and folding them into Tier 3 the way lib/metrics/relationships
// does would flatter the long tail.
export const inboundByBucket = <A extends ReviewAgentLike>(
  agents: A[],
  loads: Load[],
  fromKey: string,
  toKey: string,
  ctx: BookCtx,
): InboundCut => {
  const bucket = new Map<string, Bucket>(agents.map((a) => [a.agent_id, bucketOf(a, ctx)]));
  const windowed = attributedIn(loads, fromKey, toKey);
  const of = (b: Bucket) => shareOf(windowed.filter((l) => l.agent_id != null && bucket.get(l.agent_id) === b));
  return {
    all: shareOf(windowed),
    tier1: of("tier1"),
    tier2: of("tier2"),
    tier3: of("tier3"),
    prospects: of("prospect"),
  };
};

export interface InboundMonth extends InboundCut {
  month: string; // 'YYYY-MM'
}

// The calendar months from the system's start through today, inclusive.
export const monthsSince = (startKey: string, nowKey: string): string[] => {
  const out: string[] = [];
  let y = Number(startKey.slice(0, 4));
  let m = Number(startKey.slice(5, 7));
  const endKey = nowKey.slice(0, 7);
  for (let guard = 0; guard < 600; guard++) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    if (k > endKey) break;
    out.push(k);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
};

const monthBounds = (monthKey: string): { from: string; to: string } => {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  return { from: `${monthKey}-01`, to: utcDayKey(new Date(Date.UTC(y, m, 0))) };
};

export const inboundMonths = <A extends ReviewAgentLike>(
  agents: A[],
  loads: Load[],
  startKey: string,
  nowKey: string,
  ctx: BookCtx,
): InboundMonth[] =>
  monthsSince(startKey, nowKey).map((month) => {
    const b = monthBounds(month);
    // The first month starts the day the system did, not the 1st.
    const from = month === startKey.slice(0, 7) ? startKey : b.from;
    const to = b.to < nowKey ? b.to : nowKey;
    return { month, ...inboundByBucket(agents, loads, from, to, ctx) };
  });

// The trend chart earns its pixels only with three months that each carry five
// attributed loads; under that it is three dots pretending to be a line.
export const CHART_MIN_MONTHS = 3;
export const CHART_MIN_ATTRIBUTED = 5;

export const chartEarned = (months: InboundMonth[]): boolean =>
  months.filter((m) => m.all.attributed >= CHART_MIN_ATTRIBUTED).length >= CHART_MIN_MONTHS;

// ---------------------------------------------------------------------------
// 2. RE-TIER SUGGESTIONS — and the owner's HOLD
// ---------------------------------------------------------------------------
// A hold is an agent_tier_history row with from_tier = to_tier = the tier as it
// stands and a reason that starts "hold — ". It hides the suggestion while the
// EVIDENCE behind it is unchanged. The evidence sentence ends with the two
// facts that decide the suggestion — the delivered count and the ladder band —
// so a cent of RPM drift inside the same band does not make the book nag again,
// while a new load or a band change lifts the hold on its own.

export const HOLD_PREFIX = "hold — ";
const NOT_ESTABLISHED_PREFIX = "not yet established — ";
const ON = " on ";

const money2 = (n: number): string => `$${n.toFixed(2)}`;

// The stable tail: "3 loads · above Strong", or "2 of 3 loads" for an agent
// holding a tier without the footprint to earn one.
export const holdKeyOf = (delivered: number, band: string | null, established: boolean): string =>
  established ? `${delivered} load${delivered === 1 ? "" : "s"} · ${band ?? "no band"}` : `${delivered} of ${ESTABLISHED_AT} loads`;

// The tail an evidence sentence is compared ON — read the same way out of a
// stored reason and out of what the book computes now, so the two are always
// judged by the same boundary. The established form is "{rpm} all-in on {tail}"
// and the tail begins after the LAST " on " — a bare endsWith() would let a
// stored "on 13 loads · above Target" swallow a fresh "3 loads · above Target"
// and keep the suggestion hidden after ten more loads. The unestablished form
// carries no " on " at all, so it IS its own tail.
export const holdTailOf = (text: string): string => {
  const t = text.trim();
  if (t.startsWith(NOT_ESTABLISHED_PREFIX)) return t;
  const at = t.lastIndexOf(ON);
  return at === -1 ? t : t.slice(at + ON.length);
};

// What the row prints and what a hold stores. It ALWAYS ends with the stable
// tail — that is the whole suppression mechanism, so nothing may be appended
// after the key.
export const evidenceOf = (rpm: number | null, partial: boolean, delivered: number, band: string | null, established: boolean): string => {
  const key = holdKeyOf(delivered, band, established);
  if (!established) return `not yet established — ${key}`;
  return `${rpm != null ? `${money2(rpm)} all-in${partial ? "*" : ""}` : "no RPM"} on ${key}`;
};

// The agent's latest history row — a hold only counts while nothing has
// happened since; a real move after it retires the hold.
const latestHistory = (history: TierHistoryLike[], agentId: string): TierHistoryLike | null => {
  let best: TierHistoryLike | null = null;
  for (const h of history) {
    if (h.agent_id !== agentId) continue;
    if (best == null || h.changed_at > best.changed_at) best = h;
  }
  return best;
};

export const isHoldRow = (h: TierHistoryLike): boolean =>
  h.from_tier === h.to_tier && h.reason.trim().toLowerCase().startsWith(HOLD_PREFIX.trim().toLowerCase());

// `evidence` is the sentence the book would show RIGHT NOW. The stored reason
// is stripped of its prefix and both sides are reduced to their tail, so the
// comparison is an equality on a boundary rather than a substring race.
export const heldOn = (history: TierHistoryLike[], agentId: string, evidence: string): boolean => {
  const last = latestHistory(history, agentId);
  if (last == null || !isHoldRow(last)) return false;
  // The prefix is stripped by its WORD, not its length: isHoldRow accepts it
  // in any case and with or without the trailing space, so the slice has to
  // survive the same shapes.
  const stored = last.reason.trim().slice(HOLD_PREFIX.trim().length).trimStart();
  return holdTailOf(stored) === holdTailOf(evidence);
};

export type SuggestionDirection = "up" | "down" | "flat";

const RANK: Record<Bucket, number> = { tier1: 1, tier2: 2, tier3: 3, prospect: 4, parked: 5 };

export const directionOf = (from: Bucket, to: BucketSuggestion): SuggestionDirection => {
  if (to === "below") return "down";
  if (to == null) return "flat";
  const a = RANK[from];
  const b = RANK[to];
  return b < a ? "up" : b > a ? "down" : "flat";
};

export interface SuggestionRow<A> {
  agent: A;
  bucket: Bucket; // where they sit now
  suggestion: BucketSuggestion; // where the numbers put them
  suggestionWord: string; // "Tier 1" · "Prospect" · "Losing money"
  direction: SuggestionDirection;
  delivered: number;
  rpm: number | null;
  partial: boolean;
  band: string | null;
  established: boolean;
  losing: boolean; // established and under walk-away — the Park? row
  needsTier: boolean; // established, no owner-set tier
  evidence: string; // what the row says and what a hold would store
  holdKey: string; // the stable tail the suppression compares
  context: string; // evidence + the last two-way contact — the row's line 2
  lastTwoWay: string | null;
  held: boolean; // a standing hold on exactly this evidence
}

export interface Suggestions<A> {
  rows: SuggestionRow<A>[]; // agents already holding a tier (or parked-with-a-verdict)
  needsTier: SuggestionRow<A>[]; // established, never placed
  held: SuggestionRow<A>[]; // suppressed by a standing hold
  count: number; // what the tab suffix shows: rows + needsTier
}

// Every agent whose suggestion disagrees with the bucket they sit in, minus the
// ones the owner has already held. Ladder null → suggestBucket returns null and
// nothing is claimed: no ladder, no verdict.
export const suggestionsWithHolds = <A extends ReviewAgentLike>(
  agents: A[],
  loads: Load[],
  contacts: ReviewContactLike[],
  ladder: RateLadder | null,
  history: TierHistoryLike[],
  now: Date,
  loadsReady = true,
): Suggestions<A> => {
  const ctx: BookCtx = { loads, contacts, now, loadsReady };
  const rows: SuggestionRow<A>[] = [];
  const needsTier: SuggestionRow<A>[] = [];
  const held: SuggestionRow<A>[] = [];
  if (!loadsReady) return { rows, needsTier, held, count: 0 };

  for (const agent of agents) {
    const bucket = bucketOf(agent, ctx);
    // Parked is a decision — the owner's, or 180 quiet days. Nothing is
    // suggested over it; the quarter's RISERS is the door back.
    if (bucket === "parked") continue;
    const delivered = deliveredCount(loads, agent.agent_id);
    const rpm = agentAllInRpm(loads, agent.agent_id, now);
    // dormant: false on purpose. The only agents left here are the owner's own
    // tier seats and live prospects, and nothing in this book parks itself —
    // a quiet Tier 1 with no footprint is suggested back to Prospect and shows
    // up under COOLING, never proposed for the Parked shelf.
    const suggestion = suggestBucket(agent, { deliveredCount: delivered, rpm: rpm.rpm, ladder, dormant: false });
    if (suggestion == null) continue; // no ladder / no miles — no verdict
    const asBucket = suggestion === "below" ? null : suggestion;
    if (asBucket === bucket) continue; // the book already agrees

    const established = isEstablished(delivered);
    const band = bandLabel(rpm.rpm, ladder);
    const holdKey = holdKeyOf(delivered, band, established);
    const evidence = evidenceOf(rpm.rpm, rpm.partial, delivered, band, established);
    const lastTwoWay = lastMeaningfulContact(agent.agent_id, contacts, loads);
    const row: SuggestionRow<A> = {
      agent,
      bucket,
      suggestion,
      suggestionWord: suggestion === "below" ? "Park?" : (suggestionLabel(suggestion) ?? "—"),
      direction: directionOf(bucket, suggestion),
      delivered,
      rpm: rpm.rpm,
      partial: rpm.partial,
      band,
      established,
      losing: established && suggestion === "below",
      needsTier: established && agent.relationship_tier == null,
      evidence,
      holdKey,
      context: lastTwoWay ? `${evidence} · reached ${lastTwoWay}` : `${evidence} · never a two-way contact`,
      lastTwoWay,
      held: heldOn(history, agent.agent_id, evidence),
    };
    if (row.held) held.push(row);
    else if (row.needsTier) needsTier.push(row);
    else rows.push(row);
  }

  const worst = (r: SuggestionRow<A>) => (r.losing ? 0 : r.direction === "down" ? 1 : r.direction === "up" ? 2 : 3);
  const order = (a: SuggestionRow<A>, b: SuggestionRow<A>) => worst(a) - worst(b) || b.delivered - a.delivered || nameOf(a.agent).localeCompare(nameOf(b.agent));
  rows.sort(order);
  needsTier.sort(order);
  return { rows, needsTier, held, count: rows.length + needsTier.length };
};

// ---------------------------------------------------------------------------
// 3. CONTACT CAP — the audit that should read zero
// ---------------------------------------------------------------------------

export interface CapRow<A, C> {
  agent: A;
  touches: C[]; // this week's proactive touches, earliest first
  override: boolean; // at least one was logged as a deliberate override
}

export interface CapAudit<A, C> {
  week: string; // the local Monday
  over: CapRow<A, C>[]; // two or more proactive touches this week
  touchedOnce: number;
  overrides: number; // cap_override rows this week, over or not
  // Agents whose ONE touch this week was logged as a deliberate override. The
  // `over` rows already name their touches; these would otherwise be counted
  // in `overrides` and never shown, so the audit would hide the very decision
  // it exists to surface.
  overrideOnly: CapRow<A, C>[];
}

export const capAudit = <A extends ReviewAgentLike, C extends ReviewContactLike>(
  agents: A[],
  contacts: C[],
  now: Date,
): CapAudit<A, C> => {
  const over: CapRow<A, C>[] = [];
  const overrideOnly: CapRow<A, C>[] = [];
  let touchedOnce = 0;
  let overrides = 0;
  for (const agent of agents) {
    const week = proactiveTouchesThisWeek(agent.agent_id, contacts, now);
    const overridden = week.filter((c) => c.cap_override === true).length;
    overrides += overridden;
    if (week.length >= 2) over.push({ agent, touches: week, override: overridden > 0 });
    else if (week.length === 1) {
      touchedOnce++;
      if (overridden > 0) overrideOnly.push({ agent, touches: week, override: true });
    }
  }
  const byName = (a: CapRow<A, C>, b: CapRow<A, C>) => nameOf(a.agent).localeCompare(nameOf(b.agent));
  over.sort((a, b) => b.touches.length - a.touches.length || byName(a, b));
  overrideOnly.sort(byName);
  return { week: weekKey(now), over, touchedOnce, overrides, overrideOnly };
};

// ---------------------------------------------------------------------------
// 4. HYGIENE — the record's gaps, each name a door into the book
// ---------------------------------------------------------------------------
// The first three rules are the Friday five's, imported rather than re-spelled;
// the Review adds the footprint's sixth question, best time to call.

export interface ReviewHygieneItem<A> {
  key: string;
  label: string;
  agents: A[];
}

export const reviewHygiene = <A extends ReviewAgentLike>(
  activeAgents: A[],
  loads: Load[],
  coverage: ReviewCoverageLike[],
): ReviewHygieneItem<A>[] => {
  const items: ReviewHygieneItem<A>[] = (hygiene(activeAgents, loads, coverage) as HygieneItem<A>[]).slice();
  const noBestTime = activeAgents.filter((a) => !(a.best_time_to_call ?? "").trim());
  if (noBestTime.length > 0) items.push({ key: "best_time", label: "no best time to call", agents: noBestTime });
  return items;
};

// ---------------------------------------------------------------------------
// 5. TIER MOVES — the paper trail, in the window
// ---------------------------------------------------------------------------

// "This month" is ONE calendar on this page: the local one, the same the
// milestone board reads. changed_at is a timestamp, so a move made at 8pm on
// the last day of the month is already tomorrow in UTC — it belongs to the
// month the owner made it in.
export const tierMovesIn = (history: TierHistoryLike[], fromKey: string, toKey: string): TierHistoryLike[] =>
  history
    .filter((h) => {
      if (isHoldRow(h) || h.from_tier === h.to_tier) return false;
      const day = localDayKey(new Date(h.changed_at));
      return day >= fromKey && day <= toKey;
    })
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at));

export const tierWord = (t: number | null): string => (t == null ? "Prospect" : `Tier ${t}`);

// ---------------------------------------------------------------------------
// 6. GONE QUIET — Tier 1 / 2 with nothing two-way in 30 days
// ---------------------------------------------------------------------------

export const GONE_QUIET_DAYS = 30;

export interface QuietRow<A> {
  agent: A;
  tier: 1 | 2;
  last: string | null;
  days: number | null; // null = never
}

export const goneQuiet = <A extends ReviewAgentLike>(
  agents: A[],
  contacts: ReviewContactLike[],
  loads: Load[],
  now: Date,
  days = GONE_QUIET_DAYS,
): QuietRow<A>[] => {
  const nowKey = utcDayKey(now);
  const out: QuietRow<A>[] = [];
  for (const agent of agents) {
    const tier = agent.relationship_tier;
    if ((tier !== 1 && tier !== 2) || agent.work_status === "parked") continue;
    const last = lastMeaningfulContact(agent.agent_id, contacts, loads);
    const since = last == null ? null : Math.max(0, daysBetweenKeys(last, nowKey));
    if (since != null && since < days) continue;
    out.push({ agent, tier, last, days: since });
  }
  const quiet = (r: QuietRow<A>) => (r.days == null ? Number.POSITIVE_INFINITY : r.days);
  return out.sort((a, b) => quiet(b) - quiet(a));
};

// ---------------------------------------------------------------------------
// 7. MILESTONES — waiting, and what went out this month
// ---------------------------------------------------------------------------

export interface MilestoneBoard<A> {
  waiting: MilestoneFlag<A>[];
  sentThisMonth: number;
}

export const milestoneBoard = <A extends ReviewAgentLike>(
  activeAgents: A[],
  loads: Load[],
  contacts: ReviewContactLike[],
  notes: ReviewNoteLike[],
  now: Date,
): MilestoneBoard<A> => {
  const month = localDayKey(now).slice(0, 7);
  let sentThisMonth = 0;
  for (const c of contacts) {
    if (localDayKey(new Date(c.contacted_at)).slice(0, 7) !== month) continue;
    if ((c.note ?? "").includes("[milestone:")) sentThisMonth++;
  }
  return { waiting: milestoneFlags(activeAgents, loads, contacts, notes, now), sentThisMonth };
};

// Every milestone marker already on an agent's record — the sheet's draft skips
// what has been sent.
export const markersFor = (agentId: string, contacts: ReviewContactLike[], notes: ReviewNoteLike[]): Set<string> =>
  markersOf(agentId, contacts, notes);

// ---------------------------------------------------------------------------
// 8. THE SCORECARD — 90 days, one row per agent, the verdict the suggestion made
// ---------------------------------------------------------------------------
// ▲ / ▼ are the re-tier suggestion's own direction, so the scorecard and the
// suggestions board can never disagree. Under three loads there is no verdict
// at all (THIN), and a ▼ on a Tier 1 or 2 we barely reached out to reads HOLD:
// the quarter was ours to lose.

export type Verdict = "up" | "down" | "hold" | "thin";

export const VERDICT_LOADS = 3; // under this the window cannot judge anybody
export const FED_OUT_DAYS = 4; // a ▼ on a Tier 1/2 needs at least this much effort behind it
export const NEVER_FED_OUT_DAYS = 2; // under this the agent was never really worked

export interface ScoreRow<A> {
  agent: A;
  bucket: Bucket;
  loads: number;
  net: number;
  netRpm: number | null; // Σ net ÷ Σ loaded miles
  grade: Grade | null; // against the live ladder
  deadheadPct: number | null; // Σ deadhead ÷ Σ all miles
  inbound: Share;
  lastLoad: string | null;
  lastLoadDays: number | null;
  outDays: number; // DISTINCT days we reached out — four notes in one call is one day
  inboundTouches: number;
  verdict: Verdict;
  why: string;
  active: boolean; // the window has a story for them
}

const deliveredIn = (loads: Load[], agentId: string, win: ReviewWindow): Load[] =>
  loads.filter(
    (l) =>
      l.agent_id === agentId &&
      l.load_status === "delivered" &&
      !!l.delivery_date &&
      keyOf(l.delivery_date) >= win.startKey &&
      keyOf(l.delivery_date) <= win.endKey,
  );

export const scorecardRows = <A extends ReviewAgentLike>(
  agents: A[],
  loads: Load[],
  contacts: ReviewContactLike[],
  ladder: RateLadder | null,
  win: ReviewWindow,
  suggestions: Suggestions<A>,
  now: Date,
  loadsReady = true,
): ScoreRow<A>[] => {
  const ctx: BookCtx = { loads, contacts, now, loadsReady };
  const nowKey = utcDayKey(now);
  // Every suggestion this window knows about — held ones included: a hold is
  // "not now", not "the numbers changed".
  const byAgent = new Map<string, SuggestionRow<A>>();
  for (const r of [...suggestions.rows, ...suggestions.needsTier, ...suggestions.held]) byAgent.set(r.agent.agent_id, r);

  const rows: ScoreRow<A>[] = [];
  for (const agent of agents) {
    const bucket = bucketOf(agent, ctx);
    if (bucket === "parked") continue; // parked agents are history, not a scorecard
    const mine = deliveredIn(loads, agent.agent_id, win);
    const myContacts = contacts.filter(
      (c) => c.agent_id === agent.agent_id && keyOf(c.contacted_at) >= win.startKey && keyOf(c.contacted_at) <= win.endKey,
    );
    // An out-DAY is a day of Brandie's, not UTC's: a 8pm call is already
    // tomorrow in UTC, and counting it as a second day of effort would let a
    // ▼ stand on a Tier 1 we actually reached on three evenings.
    const outDays = new Set(myContacts.filter((c) => c.direction === "outbound").map((c) => localDayKey(new Date(c.contacted_at)))).size;
    const inboundTouches = myContacts.filter((c) => c.direction === "inbound").length;

    const net = mine.reduce((s, l) => s + loadNetRevenue(l), 0);
    const loaded = mine.reduce((s, l) => s + (Number(l.loaded_miles) || 0), 0);
    const dead = mine.reduce((s, l) => s + (Number(l.deadhead_miles) || 0), 0);
    const netRpm = loaded > 0 ? net / loaded : null;
    const grade = netRpm != null && ladder ? rpmGrade(netRpm, ladder) : null;
    const lastLoad = lastLoadKey(loads, agent.agent_id);

    const suggestion = byAgent.get(agent.agent_id);
    const direction = suggestion?.direction ?? "flat";
    const tier = agent.relationship_tier;
    const tiered12 = tier === 1 || tier === 2;

    let verdict: Verdict;
    let why: string;
    if (mine.length < VERDICT_LOADS) {
      verdict = "thin";
      why = `${mine.length} load${mine.length === 1 ? "" : "s"} in the window — under the ${VERDICT_LOADS}-load bar, no verdict`;
    } else if (direction === "down" && tiered12 && outDays < FED_OUT_DAYS) {
      verdict = "hold";
      why = `never fed — ${outDays} out-day${outDays === 1 ? "" : "s"} this quarter; the verdict is on us`;
    } else if (direction === "up") {
      verdict = "up";
      why = suggestion ? `the numbers say ${suggestion.suggestionWord} — ${suggestion.evidence}` : "the numbers say higher";
    } else if (direction === "down") {
      verdict = "down";
      why = suggestion ? `the numbers say ${suggestion.suggestionWord} — ${suggestion.evidence}` : "the numbers say lower";
    } else if (ladder == null) {
      // No ladder, no band, no verdict — "the band agrees with the tier" would
      // be a claim about a comparison that was never made. Locked, like THIN.
      verdict = "thin";
      why = "no rate ladder — no verdict";
    } else {
      verdict = "hold";
      why = "earning the seat — the band agrees with the tier";
    }

    rows.push({
      agent,
      bucket,
      loads: mine.length,
      net,
      netRpm,
      grade,
      deadheadPct: loaded + dead > 0 ? dead / (loaded + dead) : null,
      inbound: shareOf(mine.filter((l) => l.booked_via != null)),
      lastLoad,
      lastLoadDays: lastLoad == null ? null : Math.max(0, daysBetweenKeys(lastLoad, nowKey)),
      outDays,
      inboundTouches,
      verdict,
      why,
      active: mine.length > 0 || outDays + inboundTouches > 0,
    });
  }

  // Tier 3 and Prospects earn a row only when the window has a story; Tier 1
  // and 2 are always answerable for.
  const kept = rows.filter((r) => r.bucket === "tier1" || r.bucket === "tier2" || r.active);
  return kept.sort((a, b) => RANK[a.bucket] - RANK[b.bucket] || b.net - a.net || nameOf(a.agent).localeCompare(nameOf(b.agent)));
};

// ---------------------------------------------------------------------------
// 9. THE QUARTER — concentration, steadiness, the months signed, the risers
// ---------------------------------------------------------------------------

const deliveredInRange = (loads: Load[], r: RecapRange): Load[] =>
  loads.filter((l) => {
    if (l.load_status !== "delivered" || !l.delivery_date) return false;
    const t = Date.parse(`${keyOf(l.delivery_date)}T00:00:00Z`);
    return t >= r.start.getTime() && t < r.end.getTime();
  });

// The share of net the three biggest agents carry — the concentration risk.
export const top3Share = (loads: Load[], r: RecapRange): number | null => {
  const byAgent = new Map<string, number>();
  let total = 0;
  for (const l of deliveredInRange(loads, r)) {
    if (!l.agent_id) continue;
    const n = loadNetRevenue(l);
    byAgent.set(l.agent_id, (byAgent.get(l.agent_id) ?? 0) + n);
    total += n;
  }
  if (total <= 0) return null;
  const top = [...byAgent.values()].sort((a, b) => b - a).slice(0, 3).reduce((s, n) => s + n, 0);
  return top / total;
};

export const STEADY_LOADS = 2;

export const steadyAgents = (loads: Load[], r: RecapRange): number => {
  const byAgent = new Map<string, number>();
  for (const l of deliveredInRange(loads, r)) if (l.agent_id) byAgent.set(l.agent_id, (byAgent.get(l.agent_id) ?? 0) + 1);
  let n = 0;
  for (const count of byAgent.values()) if (count >= STEADY_LOADS) n++;
  return n;
};

export interface MonthsSigned {
  signed: number;
  of: number;
  missing: string[]; // "Aug" — the months still unsigned
}

export const monthsSigned = (reviews: SignedPeriodLike[], r: RecapRange, nowKey: string): MonthsSigned => {
  const keys = monthKeysOf(r).filter((k) => k <= nowKey.slice(0, 7));
  const have = new Set(reviews.filter((x) => x.kind === "month").map((x) => x.period_key));
  const missing = keys.filter((k) => !have.has(k)).map(monthWord);
  return { signed: keys.length - missing.length, of: keys.length, missing };
};

export const signedFor = (reviews: SignedPeriodLike[], key: string, kind: "month" | "quarter"): SignedPeriodLike | null =>
  reviews.find((r) => r.period_key === key && r.kind === kind) ?? null;

// RISERS (REL-01 §5G): a Parked agent — parked by the owner or by dormancy —
// who has given repeat freight this quarter. The book says promote; the owner
// decides from the sheet.
export const risers = <A extends ReviewAgentLike>(agents: A[], loads: Load[], r: RecapRange, ctx: BookCtx): A[] => {
  const count = new Map<string, number>();
  for (const l of deliveredInRange(loads, r)) if (l.agent_id) count.set(l.agent_id, (count.get(l.agent_id) ?? 0) + 1);
  return agents
    .filter((a) => bucketOf(a, ctx) === "parked" && (count.get(a.agent_id) ?? 0) >= STEADY_LOADS)
    .sort((a, b) => (count.get(b.agent_id) ?? 0) - (count.get(a.agent_id) ?? 0) || nameOf(a).localeCompare(nameOf(b)));
};

export interface PruneRow<A> {
  agent: A;
  bucket: Bucket;
  outDays: number;
  inboundTouches: number;
}

export interface PruneLists<A> {
  fedStayedQuiet: PruneRow<A>[]; // worked hard, gave nothing — the prune candidates
  neverFed: PruneRow<A>[]; // barely worked — a to-do, not a prune
}

// Both lists read the same three facts over the QUARTER: loads delivered,
// inbound touches, and the distinct days we reached out. Neither list ever
// parks anybody — the owner does that from the sheet, with a reason.
export const pruneLists = <A extends ReviewAgentLike>(
  agents: A[],
  loads: Load[],
  contacts: ReviewContactLike[],
  r: RecapRange,
  ctx: BookCtx,
): PruneLists<A> => {
  const fromKey = utcDayKey(r.start);
  const toKey = utcDayKey(new Date(r.end.getTime() - 86_400_000));
  const delivered = new Map<string, number>();
  for (const l of deliveredInRange(loads, r)) if (l.agent_id) delivered.set(l.agent_id, (delivered.get(l.agent_id) ?? 0) + 1);

  const fedStayedQuiet: PruneRow<A>[] = [];
  const neverFed: PruneRow<A>[] = [];
  for (const agent of agents) {
    const bucket = bucketOf(agent, ctx);
    if (bucket !== "tier1" && bucket !== "tier2" && bucket !== "tier3") continue;
    if ((delivered.get(agent.agent_id) ?? 0) > 0) continue;
    const mine = contacts.filter((c) => c.agent_id === agent.agent_id && keyOf(c.contacted_at) >= fromKey && keyOf(c.contacted_at) <= toKey);
    // Local days, the same calendar the scorecard's out-days count on.
    const outDays = new Set(mine.filter((c) => c.direction === "outbound").map((c) => localDayKey(new Date(c.contacted_at)))).size;
    const inboundTouches = mine.filter((c) => c.direction === "inbound").length;
    const row: PruneRow<A> = { agent, bucket, outDays, inboundTouches };
    if (outDays >= FED_OUT_DAYS && inboundTouches === 0) fedStayedQuiet.push(row);
    else if (outDays < NEVER_FED_OUT_DAYS) neverFed.push(row);
  }
  const order = (a: PruneRow<A>, b: PruneRow<A>) => RANK[a.bucket] - RANK[b.bucket] || b.outDays - a.outDays || nameOf(a.agent).localeCompare(nameOf(b.agent));
  return { fedStayedQuiet: fedStayedQuiet.sort(order), neverFed: neverFed.sort(order) };
};

// GROWTH · MARKETS TO HUNT — the origin states paying best per delivered load
// in the quarter. Gross, because that is what an agent PAYS; the load count
// rides along so one lucky haul is never mistaken for a market.
export interface MarketGrade {
  state: string;
  loads: number;
  avgGross: number;
}

export const MARKETS_TO_HUNT = 3;

// Named for its window: the CALL LIST's own `marketGrades` (lib/relationships/
// callList) grades a rolling 90 days into A/B/C and is a different question —
// two exports called the same thing in one folder is a collision waiting to be
// imported wrong.
export const quarterMarketGrades = (loads: Load[], r: RecapRange, top = MARKETS_TO_HUNT): MarketGrade[] => {
  const byState = new Map<string, { n: number; gross: number }>();
  for (const l of deliveredInRange(loads, r)) {
    const state = (l.origin_state ?? "").trim().toUpperCase();
    if (!state) continue;
    const cur = byState.get(state) ?? { n: 0, gross: 0 };
    cur.n += 1;
    cur.gross += loadGross(l);
    byState.set(state, cur);
  }
  return [...byState.entries()]
    .map(([state, v]) => ({ state, loads: v.n, avgGross: v.gross / v.n }))
    .sort((a, b) => b.avgGross - a.avgGross || b.loads - a.loads || a.state.localeCompare(b.state))
    .slice(0, top);
};

export interface QuarterModel<A> {
  range: RecapRange;
  prev: RecapRange;
  top3: { share: number | null; prev: number | null };
  steady: { n: number; prev: number };
  months: MonthsSigned;
  risers: A[];
  prune: PruneLists<A>;
  markets: MarketGrade[];
  opensIn: number | null; // days until the in-progress quarter closes; null once it has
}

const previousQuarter = (r: RecapRange): RecapRange => {
  const q = Math.floor(r.start.getUTCMonth() / 3);
  const y = r.start.getUTCFullYear();
  return q === 0 ? rangeFor("quarter", y - 1, 3) : rangeFor("quarter", y, q - 1);
};

export const quarterModel = <A extends ReviewAgentLike>(
  agents: A[],
  loads: Load[],
  contacts: ReviewContactLike[],
  reviews: SignedPeriodLike[],
  period: ReviewPeriod,
  ctx: BookCtx,
  now: Date,
): QuarterModel<A> => {
  const range = period.range;
  const prev = previousQuarter(range);
  const nowKey = utcDayKey(now);
  return {
    range,
    prev,
    top3: { share: top3Share(loads, range), prev: top3Share(loads, prev) },
    steady: { n: steadyAgents(loads, range), prev: steadyAgents(loads, prev) },
    months: monthsSigned(reviews, range, nowKey),
    risers: risers(agents, loads, range, ctx),
    prune: pruneLists(agents, loads, contacts, range, ctx),
    markets: quarterMarketGrades(loads, range),
    // The audit opens the day the quarter ends — range.end is exclusive, so it
    // IS that day.
    opensIn: period.inProgress ? Math.max(0, daysBetweenKeys(nowKey, utcDayKey(range.end))) : null,
  };
};

// ---------------------------------------------------------------------------
// 10. the whole page, built once
// ---------------------------------------------------------------------------

export interface ReviewInput<A extends ReviewAgentLike> {
  agents: A[];
  loads: Load[];
  contacts: ReviewContactLike[];
  notes: ReviewNoteLike[];
  coverage: ReviewCoverageLike[];
  history: TierHistoryLike[];
  reviews: SignedPeriodLike[];
  ladder: RateLadder | null;
  period: ReviewPeriod;
  systemStart: string;
  now: Date;
  loadsReady?: boolean;
}

export interface ReviewModel<A extends ReviewAgentLike> {
  period: ReviewPeriod;
  inbound: InboundCut; // since system start — the ONE number
  months: InboundMonth[];
  chartEarned: boolean;
  suggestions: Suggestions<A>;
  cooling: CoolingSection<A>;
  milestones: MilestoneBoard<A>;
  cap: CapAudit<A, ReviewContactLike>;
  hygiene: ReviewHygieneItem<A>[];
  moves: TierHistoryLike[];
  quiet: QuietRow<A>[];
  scores: ScoreRow<A>[];
  quarter: QuarterModel<A> | null;
  signed: SignedPeriodLike | null;
}

export const buildReviewModel = <A extends ReviewAgentLike>(input: ReviewInput<A>): ReviewModel<A> => {
  const { agents, loads, contacts, notes, coverage, history, reviews, ladder, period, systemStart, now } = input;
  const loadsReady = input.loadsReady ?? true;
  const ctx: BookCtx = { loads, contacts, now, loadsReady };
  const nowKey = utcDayKey(now);
  const book = partitionBook(agents, ctx);
  const active = [...book.tier1, ...book.tier2, ...book.tier3, ...book.needsTier, ...book.prospects];
  const suggestions = suggestionsWithHolds(agents, loads, contacts, ladder, history, now, loadsReady);
  const months = inboundMonths(agents, loads, systemStart, nowKey, ctx);

  return {
    period,
    inbound: inboundByBucket(agents, loads, systemStart, nowKey, ctx),
    months,
    chartEarned: chartEarned(months),
    suggestions,
    cooling: coolingSection(agents, contacts, loads, now),
    milestones: milestoneBoard(active, loads, contacts, notes, now),
    cap: capAudit(active, contacts, now),
    hygiene: reviewHygiene(active, loads, coverage),
    // The moves board is headed "this month" (or this quarter), so it reads the
    // PERIOD's own calendar — not the 90-day evidence window the verdicts use.
    moves: tierMovesIn(history, utcDayKey(period.range.start), utcDayKey(new Date(period.range.end.getTime() - 86_400_000))),
    quiet: goneQuiet(agents, contacts, loads, now),
    scores: scorecardRows(agents, loads, contacts, ladder, period.win, suggestions, now, loadsReady),
    quarter: period.scope === "quarter" ? quarterModel(agents, loads, contacts, reviews, period, ctx, now) : null,
    signed: signedFor(reviews, period.key, period.scope),
  };
};

// The three numbers the statusbar's sub-line reads, without building the page.
export interface ReviewStatus {
  suggestions: number;
  cooling: number;
  signed: boolean;
  periodName: string;
}

export const reviewStatus = <A extends ReviewAgentLike>(input: {
  agents: A[];
  loads: Load[];
  contacts: ReviewContactLike[];
  history: TierHistoryLike[];
  reviews: SignedPeriodLike[];
  ladder: RateLadder | null;
  now: Date;
  loadsReady?: boolean;
}): ReviewStatus => {
  const period = reviewPeriod("month", 0, input.now);
  return {
    suggestions: suggestionsWithHolds(input.agents, input.loads, input.contacts, input.ladder, input.history, input.now, input.loadsReady ?? true).count,
    cooling: coolingSection(input.agents, input.contacts, input.loads, input.now).flagged.length,
    signed: signedFor(input.reviews, period.key, "month") != null,
    periodName: period.name,
  };
};

// ---------------------------------------------------------------------------
// 11. COPY REPORT — the whole page as plain text
// ---------------------------------------------------------------------------

const pct = (n: number | null): string => (n == null ? "—" : `${Math.round(n * 100)}%`);
const dollars = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;
const fraction = (s: Share): string => `${s.inbound} of ${s.attributed}`;

export const reviewReportText = <A extends ReviewAgentLike>(m: ReviewModel<A>): string => {
  const L: string[] = [];
  const head = (s: string) => {
    L.push("");
    L.push(s);
  };

  L.push(`RELATIONSHIPS REVIEW — ${m.period.label}${m.period.inProgress ? " (in progress)" : ""}`);
  L.push(`evidence: 90 days ending ${m.period.win.endKey}`);
  L.push(
    m.signed
      ? `signed ${keyOf(m.signed.reviewed_at)} by ${m.signed.reviewed_by_name ?? "the owner"}`
      : `${m.period.name} unsigned`,
  );
  if (m.signed?.targets) for (const t of m.signed.targets.split("\n")) L.push(`  target: ${t}`);

  head(`IS IT WORKING — ${fraction(m.inbound.all)} came to you${m.inbound.all.share != null ? ` (${pct(m.inbound.all.share)})` : ""}`);
  L.push(`  Tier 1 ${fraction(m.inbound.tier1)} · Tier 2 ${fraction(m.inbound.tier2)} · Tier 3 ${fraction(m.inbound.tier3)} · Prospects ${fraction(m.inbound.prospects)}`);
  for (const mm of m.months) L.push(`  ${mm.month}: ${fraction(mm.all)} · T1 ${fraction(mm.tier1)} · T2 ${fraction(mm.tier2)} · T3 ${fraction(mm.tier3)}`);

  head(`RE-TIER SUGGESTIONS · ${m.suggestions.count}`);
  if (m.suggestions.count === 0) L.push("  nothing to approve — the book agrees with the numbers");
  for (const r of [...m.suggestions.rows, ...m.suggestions.needsTier]) {
    L.push(`  ${nameOf(r.agent)}${r.agent.broker_name ? ` ${r.agent.broker_name}` : ""}: ${bucketWord(r.bucket)} → ${r.suggestionWord} · ${r.context}`);
  }
  if (m.suggestions.held.length > 0) L.push(`  (${m.suggestions.held.length} held — the evidence has not moved)`);

  head(`COOLING · FOR THE OWNER · ${m.cooling.flagged.length} flagged · ${m.cooling.watch.length} watching`);
  for (const r of m.cooling.flagged) L.push(`  ${nameOf(r.agent)}: Tier ${r.tier} · ${r.days == null ? "never a two-way contact" : `${r.days}d since two-way contact`}`);

  head(`MILESTONES · ${m.milestones.waiting.length} waiting · ${m.milestones.sentThisMonth} sent this month`);
  for (const f of m.milestones.waiting) L.push(`  ${nameOf(f.agent)}: ${f.label}${f.crossedOn ? ` · crossed ${f.crossedOn}` : ""}`);

  head(
    `CONTACT CAP · week of ${m.cap.week} · ${m.cap.over.length} over · ${m.cap.touchedOnce} touched once · ${m.cap.overrides} overrides this week`,
  );
  for (const r of m.cap.over) L.push(`  ${nameOf(r.agent)}: ${r.touches.map((t) => `${t.type} ${keyOf(t.contacted_at)}`).join(" + ")}${r.override ? " (override)" : ""}`);
  for (const r of m.cap.overrideOnly)
    L.push(`  ${nameOf(r.agent)} · ${r.touches[0].type} ${weekdayShort(r.touches[0].contacted_at)} — logged over the cap: “${(r.touches[0].note ?? "").trim() || "no note"}”`);

  head("HYGIENE");
  if (m.hygiene.length === 0) L.push("  nothing missing");
  for (const h of m.hygiene) L.push(`  ${h.agents.length} ${h.label}`);

  head(`TIER MOVES · ${m.moves.length}`);
  if (m.moves.length === 0) L.push(`  No tier moves this ${m.period.scope}.`);
  for (const h of m.moves)
    L.push(`  ${keyOf(h.changed_at)} · ${h.first_name ?? ""} ${h.last_name ?? ""}`.trimEnd() + ` · ${tierWord(h.from_tier)} → ${tierWord(h.to_tier)} · “${h.reason}” · ${h.changed_by_name ?? "—"}`);

  head(`GONE QUIET · TIER 1 / 2 · ${m.quiet.length}`);
  for (const r of m.quiet) L.push(`  ${nameOf(r.agent)}: Tier ${r.tier} · ${r.days == null ? "never" : `${r.days}d`}`);

  head(`SCORECARD · 90 days ending ${m.period.win.endKey} · ${m.scores.filter((r) => r.active).length} with activity`);
  for (const r of m.scores) {
    L.push(
      `  ${nameOf(r.agent)} [${bucketWord(r.bucket)}]: ${r.verdict.toUpperCase()} · ${r.loads} loads · ${dollars(r.net)} · ` +
        `${r.netRpm != null ? `$${r.netRpm.toFixed(2)}/mi` : "—"}${r.grade ? ` (${r.grade})` : ""} · deadhead ${pct(r.deadheadPct)} · ` +
        `inbound ${fraction(r.inbound)} · last load ${r.lastLoadDays != null ? `${r.lastLoadDays}d` : "never"} · ` +
        `touched ${r.outDays}/${r.inboundTouches} — ${r.why}`,
    );
  }

  if (m.quarter) {
    const q = m.quarter;
    head(`THE QUARTER · ${q.range.label}${q.opensIn != null ? ` · audit opens in ${q.opensIn} days` : ""}`);
    L.push(`  Top 3 share of net: ${pct(q.top3.share)} (last quarter ${pct(q.top3.prev)})`);
    L.push(`  Steady agents: ${q.steady.n} (last quarter ${q.steady.prev})`);
    L.push(`  Months signed: ${q.months.signed} of ${q.months.of}${q.months.missing.length ? ` — ${q.months.missing.join(", ")} unsigned` : ""}`);
    L.push(`  Risers: ${q.risers.length === 0 ? "none" : q.risers.map((a) => nameOf(a)).join(", ")}`);
    L.push(`  Fed, stayed quiet: ${q.prune.fedStayedQuiet.length === 0 ? "none" : q.prune.fedStayedQuiet.map((r) => `${nameOf(r.agent)} (${r.outDays} out-days)`).join(", ")}`);
    L.push(`  Never fed: ${q.prune.neverFed.length === 0 ? "none" : q.prune.neverFed.map((r) => `${nameOf(r.agent)} (${r.outDays} out-days)`).join(", ")}`);
    L.push(`  Markets to hunt: ${q.markets.length === 0 ? "—" : q.markets.map((g) => `${g.state} ${dollars(g.avgGross)}/load on ${g.loads}`).join(" · ")}`);
  }

  L.push("");
  L.push("tier moves are the owner's — with a written reason, every time.");
  return L.join("\n");
};
