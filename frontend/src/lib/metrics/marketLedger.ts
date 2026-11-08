// THE MARKET LEDGER — the two halves of every market you touch.
//
// Spot oversize barely repeats a LANE (63 delivered loads, 57 distinct lanes,
// four of them run twice), but it repeats MARKETS. So the unit here is the
// market, and every market has two halves that answer two different questions:
//
//   OUT — what the freight born here pays. Typical $/mi, $/day, how many
//         agents source it, graded by the Load Scorer's own outbound rule so
//         this page and Score a Load can never disagree.
//   IN  — what a delivery here LEAVES you. Read off your own load sequence:
//         the empty miles to the next pickup, the days you waited for it, and
//         what that next load paid.
//
// House rules that shape everything below:
//   • dates are YYYY-MM-DD day keys compared as STRINGS, never local Date math
//   • numeric API columns arrive as strings — Number() them
//   • null is "no data", never 0. A deadhead of 0 on the next load is "not
//     logged", not a free reload, so it is null here and the UI says so
//   • $/mi is GROSS ÷ loaded miles; "typical" is the MEDIAN of the per-load
//     rates (the Guide's typical-vs-blended rule)
//   • $/day is the weighted rule in perDay.ts (Σgross ÷ Σdays), never a mean
//     of per-load rates
import { DEFAULT_DETENTION_FREE_HOURS } from "../detention";
import type { Load } from "@/types/load";
import { getRegion, getStateName, UNKNOWN_REGION } from "@/lib/constants/states";
import { DAY_MS, keyOf, localDayKey, daysBetweenKeys } from "@/lib/relationships/dayKeys";
import { median } from "./stats";
import { loadRevenue } from "./loads";
import { perDayOver, type PerDayTotals } from "./perDay";
import { agentRows, type AgentStat } from "./lanes";
import { outboundStrength, inboundStrength, type MarketGrade, type GradeCosts, NO_COSTS } from "./marketFactor";
import { isDelivered } from "./status";

// ------------------------------------------------------------- the windows

// The 30/60/90 tabs came off (decision 4A): on a spot book they showed four
// loads and a blank map. These hold freight.
export type LedgerWindow = "12m" | "ytd" | "all";

export const LEDGER_WINDOWS: { value: LedgerWindow; label: string }[] = [
  { value: "12m", label: "12 months" },
  { value: "ytd", label: "This year" },
  { value: "all", label: "All time" },
];

export const DEFAULT_WINDOW: LedgerWindow = "12m";

// Shift a day key by whole days, anchored at UTC midnight both ends so a DST
// hour can never add or drop a day (CLAUDE.md §5).
const shiftKey = (key: string, days: number): string =>
  new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

// Is this delivered load inside the window? Dated by its DELIVERY day, against
// TODAY in the account's own zone (localDayKey — Central; after 7pm Central a
// UTC "today" is already tomorrow).
export const inWindow = (l: Load, win: LedgerWindow, now: Date): boolean => {
  if (!isDelivered(l)) return false;
  if (win === "all") return true;
  if (!l.delivery_date) return false;
  const day = keyOf(l.delivery_date);
  const today = localDayKey(now);
  if (win === "ytd") return day.slice(0, 4) === today.slice(0, 4);
  return day >= shiftKey(today, -365);
};

export const windowLoads = (
  loads: Load[],
  win: LedgerWindow,
  now: Date,
): Load[] => loads.filter((l) => inWindow(l, win, now));

// ------------------------------------------------------- the load sequence

// What the NEXT load cost you to get to. null figures are unknowns, never
// zeroes: a 0 deadhead is a deadhead nobody logged.
export interface NextLeg {
  deadheadMiles: number | null; // empty miles to the next pickup
  deadheadSource: "odometer" | "planned" | null; // the odometer gap when both readings exist, else the planned field
  idleDays: number | null; // WEEKDAYS from this delivery to that pickup (a weekend reload is not idle)
  calendarDays: number | null; // the raw gap, for the home-time fallback
  originState: string | null; // where you reloaded
  originMarket: string | null; // …and the market, when the book names one
  rpm: number | null; // what the next load paid, GROSS ÷ loaded miles
  gross: number | null; // what the next load paid, in dollars — the reload's cost is read as a share of it
  pickupDay: string; // its pickup day key
}

export interface SequencedLoad {
  load: Load;
  // HOME TIME is not a market's fault. A logged home trip between this
  // delivery and the next pickup marks it (Jason's stints run Thursday to
  // Monday — four days, which no gap rule would catch), and a gap over a week
  // still does. Flagged here, kept out of every idle and reload average and
  // every grade, still shown in the detail as "(home)" — the truck was parked
  // on purpose.
  home: boolean;
  next: NextLeg | null; // null on the last load you've run
}

export const HOME_IDLE_DAYS = 7;

// The slice of a trip the sequence reads — a home run between two loads.
export interface HomeTripLike {
  trip_date: string;
  trip_purpose: string;
  status?: string;
}

// Weekdays strictly after `fromKey` up to and including `toKey` — the days a
// reload could have happened. Fri → Mon is one day, not three; Mon → Wed two.
const weekdaysBetween = (fromKey: string, toKey: string): number => {
  const n = daysBetweenKeys(fromKey, toKey);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const start = new Date(`${fromKey}T00:00:00Z`).getTime();
  let count = 0;
  for (let i = 1; i <= n; i++) {
    const dow = new Date(start + i * DAY_MS).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
};

// The empty miles to the next load, from the odometer where it can be read.
// Jason's book copies the previous load's END reading as the next load's START
// (the chain is continuous), so the empty run to the pickup sits INSIDE the
// next load's own window: its window minus its loaded miles is the deadhead
// (v1.236.0 read the gap between the two loads instead — zero by that
// convention — and graded every reload as free). A book that takes a fresh
// reading at the pickup shows the opposite: a gap between the loads and no
// excess in the window — so the gap is read when the window has none. The
// planned field is the fallback, which the book itself warns understates.
const emptyMilesTo = (load: Load, nextLoad: Load): { miles: number | null; source: NextLeg["deadheadSource"] } => {
  const ns = Number(nextLoad.odometer_start);
  const ne = Number(nextLoad.odometer_end);
  const loaded = Number(nextLoad.loaded_miles);
  const plausible = (m: number) => Number.isFinite(m) && m >= 0 && m <= 3000;
  if (nextLoad.odometer_start != null && nextLoad.odometer_end != null && ns > 0 && ne > ns && loaded > 0) {
    const excess = ne - ns - loaded;
    if (plausible(excess) && excess > 0) return { miles: excess, source: "odometer" };
  }
  const end = Number(load.odometer_end);
  if (load.odometer_end != null && nextLoad.odometer_start != null && end > 0 && ns > 0) {
    const gap = ns - end;
    if (plausible(gap) && gap > 0) return { miles: gap, source: "odometer" };
  }
  const dh = deadheadOf(nextLoad);
  return { miles: dh, source: dh == null ? null : "planned" };
};

const rpmOf = (l: Load): number | null => {
  const miles = Number(l.loaded_miles);
  return miles > 0 ? loadRevenue(l) / miles : null;
};

// A single load's own deadhead, or null when it is 0 / missing / unparseable.
const deadheadOf = (l: Load): number | null => {
  const dh = Number(l.deadhead_miles);
  return Number.isFinite(dh) && dh > 0 ? dh : null;
};

// EVERY delivered load with a pickup date — not just the window's. The "next"
// of the last load inside a window is a real load outside it, and pretending
// otherwise would invent a stranding that never happened.
export const sequenceLoads = (loads: Load[], trips: HomeTripLike[] = []): SequencedLoad[] => {
  const homeDays = trips
    .filter((t) => t.trip_purpose === "home" && t.status !== "cancelled" && t.trip_date)
    .map((t) => keyOf(t.trip_date))
    .sort();
  const runs = loads
    .filter((l) => isDelivered(l) && !!l.pickup_date)
    .sort(
      (a, b) =>
        keyOf(a.pickup_date).localeCompare(keyOf(b.pickup_date)) ||
        keyOf(a.delivery_date ?? a.pickup_date).localeCompare(
          keyOf(b.delivery_date ?? b.pickup_date),
        ),
    );

  return runs.map((load, i) => {
    const nextLoad = runs[i + 1];
    if (!nextLoad) return { load, home: false, next: null };

    const pickupDay = keyOf(nextLoad.pickup_date);
    const deliveryDay = load.delivery_date ? keyOf(load.delivery_date) : null;
    const gap = deliveryDay ? daysBetweenKeys(deliveryDay, pickupDay) : null;
    // Clamped at 0: loads overlap in the real book (the next one picks up
    // before this one delivers — a relay, a two-truck week, a corrected date).
    // The truck sat no days, so the pair reads "0 d". A NEGATIVE idle would
    // pull a market's average below zero and flatter it for a clash.
    const calendarDays =
      gap != null && Number.isFinite(gap) ? Math.max(0, gap) : null;
    const idleDays = deliveryDay ? weekdaysBetween(deliveryDay, pickupDay) : null;
    const wentHome =
      deliveryDay != null && homeDays.some((d) => d >= deliveryDay && d <= pickupDay);
    const empty = emptyMilesTo(load, nextLoad);

    return {
      load,
      home: wentHome || (calendarDays != null && calendarDays > HOME_IDLE_DAYS),
      next: {
        deadheadMiles: empty.miles,
        deadheadSource: empty.source,
        idleDays,
        calendarDays,
        originState: nextLoad.origin_state || null,
        originMarket: stripMarket(nextLoad.origin_market) || null,
        rpm: rpmOf(nextLoad),
        gross: loadRevenue(nextLoad) > 0 ? loadRevenue(nextLoad) : null,
        pickupDay,
      },
    };
  });
};

// ---------------------------------------------------------------- the rows

export type LedgerGrain = "state" | "region";

export interface HalfOut {
  loads: number;
  typicalRpm: number | null; // median of the per-load rates
  blendedRpm: number | null; // Σgross ÷ Σloaded miles
  perDay: PerDayTotals;
  agents: number;
  gross: number;
  perDayExFuel: number | null; // the median ex-fuel $/day the grade is read off
  grade: MarketGrade;
}

export interface HalfIn {
  deliveries: number;
  reloadMilesMedian: number | null;
  reloadMilesAvg: number | null;
  idleDaysAvg: number | null;
  reloadCostMedian: number | null; // the reload in dollars
  shareMedian: number | null; // as a share of the load it led to — the grade's basis
  nextRpmMedian: number | null;
  reloadedInState: number; // times the next load loaded in this same market
  grade: MarketGrade;
}

export interface LedgerRow {
  state: string; // the key: a 2-letter code, or a freight region at region grain
  name: string; // what to call it on the map's tooltip
  markets: string[]; // origin markets seen here, most-used first, ≤ 3
  out: HalfOut;
  in: HalfIn;
}

const MAX_MARKETS = 3;

const up = (s?: string | null): string => String(s ?? "").trim().toUpperCase();

// "Greenville Market" → "Greenville". The book names markets with the suffix;
// nobody says it out loud.
export const stripMarket = (name?: string | null): string =>
  String(name ?? "")
    .replace(/\s*markets?$/i, "")
    .trim();

// The bucket a state code belongs to at this grain. "" = unrecognized, skip it.
const grainKey = (stateAbbr: string | null | undefined, grain: LedgerGrain): string => {
  const abbr = up(stateAbbr);
  if (!abbr) return "";
  if (grain === "state") return getStateName(abbr) ? abbr : "";
  const region = getRegion(abbr);
  return region === UNKNOWN_REGION ? "" : region;
};

const grainName = (key: string, grain: LedgerGrain): string =>
  grain === "state" ? (getStateName(key) ?? key) : key;

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;

const grossOf = (loads: Load[]): number =>
  loads.reduce((s, l) => s + loadRevenue(l), 0);

const blendedOf = (loads: Load[]): number | null => {
  const miles = loads.reduce((s, l) => s + (Number(l.loaded_miles) || 0), 0);
  return miles > 0 ? grossOf(loads) / miles : null;
};

const typicalOf = (loads: Load[]): number | null =>
  median(loads.map(rpmOf).filter((r): r is number => r != null));

const push = <T>(map: Map<string, T[]>, key: string, item: T): void => {
  const bucket = map.get(key);
  if (bucket) bucket.push(item);
  else map.set(key, [item]);
};

const topMarkets = (loads: Load[]): string[] => {
  const counts = new Map<string, number>();
  for (const l of loads) {
    const m = stripMarket(l.origin_market);
    if (m) counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_MARKETS)
    .map(([m]) => m);
};

// One row per market that appears as an origin OR a destination in the window.
// The IN half reads the FULL sequence (so the next load can sit outside the
// window) but only for the window's own deliveries.
export const buildLedger = (
  loads: Load[],
  win: LedgerWindow,
  now: Date,
  grain: LedgerGrain = "state",
  trips: HomeTripLike[] = [],
  // The ladder's bars and costs (gradeCostsOf(targets)); without them every
  // grade is thin — the figures still print.
  costs: GradeCosts = NO_COSTS,
): LedgerRow[] => {
  const scoped = windowLoads(loads, win, now);
  const fullSeq = sequenceLoads(loads, trips);
  const seqById = new Map(fullSeq.map((s) => [s.load.load_id, s]));
  // The window's own sequence entries — the grades are computed on exactly the
  // loads the numbers beside them come from. A delivered load with no pickup
  // date has no sequence entry, so it is out of the IN half entirely (the
  // headline reports it once, as "{n} undated") rather than padding the
  // delivery count the grade is read against.
  const winSeq = scoped
    .map((l) => seqById.get(l.load_id))
    .filter((s): s is SequencedLoad => !!s);

  // Both grades are read against your COST, never against this window's own
  // numbers: switching 12m → ytd → all can't re-grade a market whose own
  // figures didn't move.
  const outGrades = outboundStrength(scoped, (l) => grainKey(l.origin_state, grain), costs);
  const inGrades = inboundStrength(winSeq, costs, (s) => grainKey(s.load.destination_state, grain));

  const outBy = new Map<string, Load[]>();
  for (const l of scoped) {
    const o = grainKey(l.origin_state, grain);
    if (o) push(outBy, o, l);
  }
  // ONE delivery set, shared by the row's count and by the grade's thin test.
  const inBy = new Map<string, SequencedLoad[]>();
  for (const s of winSeq) {
    const d = grainKey(s.load.destination_state, grain);
    if (d) push(inBy, d, s);
  }

  const keys = new Set([...outBy.keys(), ...inBy.keys()]);
  const rows: LedgerRow[] = [];

  for (const key of keys) {
    const outLoads = outBy.get(key) ?? [];
    const legs = inBy.get(key) ?? [];

    // Home stints leave the reload and idle medians alike — the same rule the
    // grade uses, so the figure beside the grade is the figure it was read off.
    const away = legs.filter((s) => !s.home);
    const reloads = away
      .map((s) => s.next?.deadheadMiles)
      .filter((m): m is number => m != null);
    const idles = away
      .map((s) => s.next?.idleDays)
      .filter((d): d is number => d != null);
    const nextRpms = legs
      .map((s) => s.next?.rpm)
      .filter((r): r is number => r != null);

    rows.push({
      state: key,
      name: grainName(key, grain),
      markets: topMarkets(outLoads),
      out: {
        loads: outLoads.length,
        typicalRpm: typicalOf(outLoads),
        blendedRpm: blendedOf(outLoads),
        perDay: perDayOver(outLoads),
        agents: new Set(outLoads.map((l) => l.agent_id).filter(Boolean)).size,
        gross: grossOf(outLoads),
        perDayExFuel: outGrades.get(key)?.perDayExFuel ?? null,
        grade: outGrades.get(key)?.grade ?? "thin",
      },
      in: {
        deliveries: legs.length,
        reloadMilesMedian: median(reloads),
        reloadMilesAvg: mean(reloads),
        idleDaysAvg: mean(idles),
        reloadCostMedian: inGrades.get(key)?.reloadCostMedian ?? null,
        shareMedian: inGrades.get(key)?.shareMedian ?? null,
        nextRpmMedian: median(nextRpms),
        reloadedInState: legs.filter(
          (s) => s.next && grainKey(s.next.originState, grain) === key,
        ).length,
        grade: inGrades.get(key)?.grade ?? "thin",
      },
    });
  }

  // Sorted by OUT $/mi among the markets that have given you real freight;
  // everything else falls in behind by how often you've delivered there, so a
  // one-load origin you deliver to nine times (VA) still gets a row.
  const graded = rows.filter((r) => r.out.loads >= 2);
  const rest = rows.filter((r) => r.out.loads < 2);
  graded.sort(
    (a, b) =>
      (b.out.typicalRpm ?? -1) - (a.out.typicalRpm ?? -1) ||
      a.state.localeCompare(b.state),
  );
  rest.sort(
    (a, b) => b.in.deliveries - a.in.deliveries || a.state.localeCompare(b.state),
  );
  return [...graded, ...rest];
};

export interface LedgerFold {
  shown: LedgerRow[];
  foldedOrigins: string[]; // the one-load origins, by key
  foldedDeliveryStates: number; // how many one-delivery markets folded
}

// A single haul is a story, not a market. Rows thin on BOTH halves fold under
// the table; the map hatches them rather than shading them.
export const ledgerFolded = (rows: LedgerRow[]): LedgerFold => {
  const shown: LedgerRow[] = [];
  const folded: LedgerRow[] = [];
  for (const r of rows) {
    if (r.out.loads < 2 && r.in.deliveries < 2) folded.push(r);
    else shown.push(r);
  }
  return {
    shown,
    foldedOrigins: folded.filter((r) => r.out.loads > 0).map((r) => r.state),
    foldedDeliveryStates: folded.filter((r) => r.in.deliveries > 0).length,
  };
};

// -------------------------------------------------------- the repeat lanes

export interface LaneRow {
  lane: string; // "Greenville → Washington DC"
  states: string; // "SC › VA"
  originState: string;
  destState: string;
  loads: number;
  typicalRpm: number | null;
  perDay: PerDayTotals;
  gross: number;
  types: string[];
  agents: string[];
  lastDay: string | null;
  milesAvg: number | null;
}

// `singles` rides along because the fold line under the board needs it and
// recomputing it would mean grouping the same loads twice.
export interface RepeatLanes {
  rows: LaneRow[];
  singles: number;
}

export const repeatLanes = (
  loads: Load[],
  win: LedgerWindow,
  now: Date,
): RepeatLanes => {
  const scoped = windowLoads(loads, win, now);
  const byLane = new Map<string, Load[]>();
  for (const l of scoped) {
    const from = stripMarket(l.origin_market);
    const to = stripMarket(l.delivery_market);
    // A lane needs BOTH ends named. A load the book never gave a market to
    // isn't a lane called " → Dallas" — it is a load with a hole in it, and
    // counting it as a single would inflate the fold line too. It is in
    // neither the rows nor `singles`.
    if (!from || !to) continue;
    push(byLane, `${from} → ${to}`, l);
  }

  const rows: LaneRow[] = [];
  let singles = 0;
  for (const [lane, laneLoads] of byLane) {
    if (laneLoads.length < 2) {
      singles++;
      continue;
    }
    const first = laneLoads[0];
    const miles = laneLoads
      .map((l) => Number(l.loaded_miles))
      .filter((m) => Number.isFinite(m) && m > 0);
    const days = laneLoads
      .map((l) => (l.delivery_date ? keyOf(l.delivery_date) : null))
      .filter((d): d is string => !!d)
      .sort();
    rows.push({
      lane,
      states: `${up(first.origin_state)} › ${up(first.destination_state)}`,
      originState: up(first.origin_state),
      destState: up(first.destination_state),
      loads: laneLoads.length,
      typicalRpm: typicalOf(laneLoads),
      perDay: perDayOver(laneLoads),
      gross: grossOf(laneLoads),
      types: [...new Set(laneLoads.map((l) => l.load_type?.trim()).filter(Boolean))] as string[],
      agents: [...new Set(laneLoads.map((l) => l.agent).filter(Boolean))],
      lastDay: days.length ? days[days.length - 1] : null,
      milesAvg: mean(miles),
    });
  }

  rows.sort((a, b) => b.loads - a.loads || b.gross - a.gross);
  return { rows, singles };
};

// -------------------------------------------------------- the market detail

export interface DeliveryStory {
  load: Load;
  deliveredDay: string | null;
  deliveredMarket: string;
  fromMarket: string;
  gross: number;
  next: NextLeg | null;
  home: boolean;
}

export interface MarketDetail {
  agents: AgentStat[];
  loadsOut: Load[];
  deliveries: DeliveryStory[];
}

// One clicked market: who sources the freight born here, what you've hauled
// out, and — the new half — what every delivery here left you with.
export const marketDetail = (
  loads: Load[],
  seq: SequencedLoad[],
  win: LedgerWindow,
  now: Date,
  state: string,
  grain: LedgerGrain = "state",
  freeHours = DEFAULT_DETENTION_FREE_HOURS,
): MarketDetail => {
  const scoped = windowLoads(loads, win, now);
  const seqById = new Map(seq.map((s) => [s.load.load_id, s]));

  const loadsOut = scoped.filter((l) => grainKey(l.origin_state, grain) === state);
  // The SAME delivery set the ledger row counts and the grade is read off: a
  // delivered load with no pickup date has no place in the sequence, so it has
  // no reload story to tell and is not listed here either. The board's "n"
  // and the row's "deliv" are then the one number.
  const deliveries = scoped
    .filter(
      (l) =>
        grainKey(l.destination_state, grain) === state &&
        seqById.has(l.load_id),
    )
    .map((l) => {
      const entry = seqById.get(l.load_id);
      return {
        load: l,
        deliveredDay: l.delivery_date ? keyOf(l.delivery_date) : null,
        deliveredMarket: stripMarket(l.delivery_market),
        fromMarket: stripMarket(l.origin_market),
        gross: loadRevenue(l),
        next: entry?.next ?? null,
        home: entry?.home ?? false,
      };
    })
    .sort((a, b) => (b.deliveredDay ?? "").localeCompare(a.deliveredDay ?? ""));

  return { agents: agentRows(loadsOut, freeHours), loadsOut, deliveries };
};

// ------------------------------------------------------- the answering line

export interface LedgerHeadline {
  loads: number;
  originStates: number;
  deliveryStates: number;
  emptyShare: number | null; // Σdeadhead ÷ (Σdeadhead + Σloaded)
  undated: number; // delivered loads in the window with no pickup date
  bestOut: LedgerRow | null;
  easiestIn: LedgerRow | null;
  costliestIn: LedgerRow | null;
}

const MIN_IN_CALLOUT = 3;

// The sentence at the top of the page. Every clause is optional: a figure with
// no data behind it is omitted, never printed as a zero.
//
// `scoped` is the WINDOW'S OWN LOADS — the same list `buildLedger` rolled the
// rows up from. The counts are taken off it rather than summed out of the rows,
// so a load whose origin state the book never recognised is still one of your
// loads in the headline.
export const ledgerHeadline = (
  rows: LedgerRow[],
  scoped: Load[],
  grain: LedgerGrain = "state",
): LedgerHeadline => {
  let empty = 0;
  let loaded = 0;
  for (const l of scoped) {
    // A MILEAGE share, not the reload signal: here a deadhead of 0 really is
    // zero empty miles on this load's own ledger, so it counts as 0. (The IN
    // half reads the NEXT load's deadhead, where 0 means "nobody logged it" —
    // a different question, deliberately answered differently.)
    empty += Number(l.deadhead_miles) || 0;
    loaded += Number(l.loaded_miles) || 0;
  }

  const distinct = (pick: (l: Load) => string | null | undefined): number =>
    new Set(
      scoped.map((l) => grainKey(pick(l), grain)).filter(Boolean),
    ).size;

  const outRows = rows.filter(
    (r) => r.out.loads >= 2 && r.out.typicalRpm != null &&
      (r.out.grade === "strong" || r.out.grade === "fair"),
  );
  const inRows = rows.filter(
    (r) => r.in.deliveries >= MIN_IN_CALLOUT && (r.in.shareMedian != null || r.in.reloadMilesMedian != null),
  );
  // In dollars (the share of the load it led to) when the costs are known;
  // in miles until a P&L gives the page a cost.
  const inKey = (r: LedgerRow): number => (r.in.shareMedian ?? r.in.reloadMilesMedian) as number;

  const pick = <T>(xs: T[], better: (a: T, b: T) => boolean): T | null =>
    xs.length ? xs.reduce((best, x) => (better(x, best) ? x : best)) : null;

  return {
    loads: scoped.length,
    originStates: distinct((l) => l.origin_state),
    deliveryStates: distinct((l) => l.destination_state),
    emptyShare: empty + loaded > 0 ? empty / (empty + loaded) : null,
    undated: scoped.filter((l) => !l.pickup_date).length,
    bestOut: pick(
      outRows,
      (a, b) => (a.out.typicalRpm as number) > (b.out.typicalRpm as number),
    ),
    easiestIn: pick(inRows, (a, b) => inKey(a) < inKey(b)),
    costliestIn: pick(inRows, (a, b) => inKey(a) > inKey(b)),
  };
};
