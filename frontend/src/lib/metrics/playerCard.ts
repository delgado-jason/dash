// Player-card math for the owner-operator. Composes the engines we already
// trust — rate ladder, P&L margin, fuel, mile clubs — into a career rank, a
// current-season grade, personal-best records, and earned trophies. Pure; take
// `now` explicitly so it's testable.
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import type { ExpensePeriod } from "@/types/expense";
import type { FuelEntry } from "@/types/fuelEntry";
import { deadheadPctOver, hasOdometerWindow } from "./deadhead";
import {
  loadRevenue,
  completeMonthsBefore,
  type RateLadder,
} from "./rateTargets";
import { mileMilestone } from "./mileClub";
import { fuelStats } from "./fuelEconomy";
import { RANK_TIERS, MARGIN_BANDS } from "@/lib/constants/playerCard";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type Grade = "below" | "minimum" | "target" | "strong";
const ORDER: Grade[] = ["below", "minimum", "target", "strong"];

// The lower of two grades (a weakness in either dimension caps the season).
export const worseGrade = (a: Grade | null, b: Grade | null): Grade | null => {
  if (a == null) return b;
  if (b == null) return a;
  return ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b;
};

// ---------- career rank ----------
export interface CareerRank {
  key: string;
  name: string;
  index: number;
  next: { name: string; min: number } | null;
  toNext: number; // miles to the next tier
  pct: number; // 0..1 progress within the current tier
  miles: number;
}

export const careerRank = (lifetimeMiles: number): CareerRank => {
  const miles = Math.max(0, lifetimeMiles || 0);
  let i = 0;
  for (let k = RANK_TIERS.length - 1; k >= 0; k--) {
    if (miles >= RANK_TIERS[k].min) {
      i = k;
      break;
    }
  }
  const cur = RANK_TIERS[i];
  const next = i < RANK_TIERS.length - 1 ? RANK_TIERS[i + 1] : null;
  const span = next ? next.min - cur.min : 0;
  return {
    key: cur.key,
    name: cur.name,
    index: i,
    next: next ? { name: next.name, min: next.min } : null,
    toNext: next ? Math.max(0, next.min - miles) : 0,
    pct: next && span > 0 ? Math.min(1, (miles - cur.min) / span) : 1,
    miles,
  };
};

// ---------- season grades ----------
export const marginGrade = (pct: number | null): Grade | null => {
  if (pct == null) return null;
  if (pct >= MARGIN_BANDS.strong) return "strong";
  if (pct >= MARGIN_BANDS.target) return "target";
  if (pct >= MARGIN_BANDS.minimum) return "minimum";
  return "below";
};

// Where your rate lands on your own break-even ladder.
export const rpmGrade = (rpm: number | null, ladder: RateLadder): Grade | null => {
  if (rpm == null || ladder.walkAway == null) return null;
  if (ladder.strong != null && rpm >= ladder.strong) return "strong";
  if (ladder.target != null && rpm >= ladder.target) return "target";
  return rpm >= ladder.walkAway ? "minimum" : "below";
};

// Utilization graded on the industry benchmark (70 / 80 / 85%).
export const utilizationGrade = (u: number | null): Grade | null => {
  if (u == null) return null;
  if (u >= 0.85) return "strong";
  if (u >= 0.8) return "target";
  if (u >= 0.7) return "minimum";
  return "below";
};

// ---------- profit-lever bottleneck (Rate × Utilization × Margin) ----------
export interface Lever {
  key: string;
  label: string;
  grade: Grade | null;
}

const GRADE_RANK: Record<Grade, number> = {
  below: 0,
  minimum: 1,
  target: 2,
  strong: 3,
};

// The weakest lever(s) worth flagging — only when the weakest is below/minimum.
// Ties return every lever at that grade. Empty = no bottleneck (all at target+,
// or nothing graded yet).
export const bottleneckLevers = (levers: Lever[]): Lever[] => {
  const graded = levers.filter((l) => l.grade != null);
  if (!graded.length) return [];
  const minRank = Math.min(...graded.map((l) => GRADE_RANK[l.grade!]));
  if (minRank > GRADE_RANK.minimum) return [];
  return graded.filter((l) => GRADE_RANK[l.grade!] === minRank);
};

// True when every graded lever is at target or better — no bottleneck to flag.
export const allLeversOnTarget = (levers: Lever[]): boolean => {
  const graded = levers.filter((l) => l.grade != null);
  return graded.length > 0 && graded.every((l) => GRADE_RANK[l.grade!] >= GRADE_RANK.target);
};

// ---------- season stat line ----------
export interface SeasonStats {
  label: string; // e.g. "Apr–Jun 2026"
  netRevenue: number; // P&L income (net of Landstar) over the window
  netProfit: number; // operating profit: income − COGS − expenses
  netMargin: number | null; // operating margin — the graded number
  trueNet: number; // operating profit − debt obligations (draws excluded)
  trueNetMargin: number | null;
  loads: number;
  totalMiles: number;
  loadedMiles: number;
  deadheadPct: number | null;
  avgRpm: number | null; // gross revenue ÷ loaded mile
  bestLane: { lane: string; revenue: number } | null;
  months: number; // months with a P&L in the window
}

const inWindow = (
  d: string | null | undefined,
  months: { year: number; month: number }[],
): boolean => {
  if (!d) return false;
  const dt = new Date(d);
  return months.some(
    (m) => dt.getUTCFullYear() === m.year && dt.getUTCMonth() === m.month,
  );
};

export const getSeasonStats = (
  periods: ExpensePeriod[],
  loads: Load[],
  trips: Trip[],
  now: Date,
  monthsBack = 3,
  // Monthly DEBT obligations (owner draws excluded) — subtracted from operating
  // profit to get True Net over the same months the P&L covers.
  obligationsDebtMonthly = 0,
): SeasonStats => {
  const months = completeMonthsBefore(now, monthsBack);

  let income = 0;
  let cost = 0;
  let n = 0;
  for (const p of periods) {
    if (!inWindow(p.period_month, months)) continue;
    income += p.income_total ?? 0;
    cost += (p.cogs_total ?? 0) + (p.expense_total ?? 0);
    n++;
  }
  const netProfit = income - cost;
  const trueNet = netProfit - obligationsDebtMonthly * n;

  const seasonLoads = loads.filter(
    (l) => l.load_status === "delivered" && inWindow(l.delivery_date, months),
  );
  const loaded = seasonLoads.reduce((s, l) => s + Number(l.loaded_miles || 0), 0);
  // Actual deadhead, odometer-derived, with non-revenue trips counted as fully
  // empty — the same math the dashboard KPI uses, so the two always agree.
  const seasonTrips = trips.filter((t) => inWindow(t.trip_date, months));
  const deadPct = deadheadPctOver(seasonLoads, seasonTrips);
  // Miles run this season. Prefer the odometer window; fall back to loaded +
  // planned deadhead when a load has no readings, so "miles" never reads 0 while
  // loaded miles exist. Trip windows are added on — they're miles too. (This
  // fallback is why totalMiles can exceed the strict odometer base deadheadPct
  // is computed from, on loads whose readings were never entered.)
  const total =
    seasonLoads.reduce((s, l) => {
      const odo =
        l.odometer_end != null && l.odometer_start != null
          ? Number(l.odometer_end) - Number(l.odometer_start)
          : 0;
      return s + (odo > 0 ? odo : Number(l.loaded_miles || 0) + Number(l.deadhead_miles || 0));
    }, 0) +
    seasonTrips.reduce((s, t) => {
      const odo =
        t.odometer_end != null && t.odometer_start != null
          ? Number(t.odometer_end) - Number(t.odometer_start)
          : 0;
      return s + Math.max(0, odo);
    }, 0);
  const revenue = seasonLoads.reduce((s, l) => s + loadRevenue(l), 0);

  const laneRev = new Map<string, number>();
  for (const l of seasonLoads) {
    const lane = `${l.origin_market} → ${l.delivery_market}`;
    laneRev.set(lane, (laneRev.get(lane) ?? 0) + loadRevenue(l));
  }
  let bestLane: { lane: string; revenue: number } | null = null;
  for (const [lane, rev] of laneRev)
    if (!bestLane || rev > bestLane.revenue) bestLane = { lane, revenue: rev };

  const label =
    months.length > 0
      ? `${MONTHS[months[0].month]}–${MONTHS[months[months.length - 1].month]} ${months[months.length - 1].year}`
      : "—";

  return {
    label,
    netRevenue: income,
    netProfit,
    netMargin: income > 0 ? netProfit / income : null,
    trueNet,
    trueNetMargin: income > 0 ? trueNet / income : null,
    loads: seasonLoads.length,
    totalMiles: total,
    loadedMiles: loaded,
    deadheadPct: deadPct,
    avgRpm: loaded > 0 ? revenue / loaded : null,
    bestLane,
    months: n,
  };
};

// ---------- personal bests (records) ----------
export interface PersonalBests {
  bestWeekRevenue: number | null;
  lowestDeadheadPct: number | null;
  bestMpg: number | null;
  biggestLoad: number | null;
  mostLoadsInWeek: number | null;
}

const weekKey = (iso: string): string => {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
};

// Group by pay-week key, skipping anything without a date to place it.
const byWeek = <T,>(
  items: T[],
  dateOf: (x: T) => string | null | undefined,
): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const d = dateOf(it);
    if (!d) continue;
    const k = weekKey(d);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
};

export const personalBests = (
  loads: Load[],
  trips: Trip[],
  fuel: FuelEntry[],
  now: Date,
): PersonalBests => {
  const delivered = loads.filter(
    (l) => l.load_status === "delivered" && l.delivery_date,
  );

  const weeks = new Map<string, { rev: number; count: number }>();
  for (const l of delivered) {
    const k = weekKey(l.delivery_date!);
    const w = weeks.get(k) ?? { rev: 0, count: 0 };
    w.rev += loadRevenue(l);
    w.count += 1;
    weeks.set(k, w);
  }

  let bestWeekRevenue: number | null = null;
  let mostLoadsInWeek: number | null = null;
  for (const w of weeks.values()) {
    if (bestWeekRevenue == null || w.rev > bestWeekRevenue) bestWeekRevenue = w.rev;
    if (mostLoadsInWeek == null || w.count > mostLoadsInWeek) mostLoadsInWeek = w.count;
  }

  // Lowest weekly deadhead, odometer-derived with trips counted as fully empty.
  // A week only stands as a record if EVERY load in it ran with both readings —
  // a partly-measured week would set a flattering record on incomplete data.
  const loadWeeks = byWeek(delivered, (l) => l.delivery_date);
  const tripWeeks = byWeek(trips, (t) => t.trip_date);
  let lowestDeadheadPct: number | null = null;
  for (const k of new Set([...loadWeeks.keys(), ...tripWeeks.keys()])) {
    const ls = loadWeeks.get(k) ?? [];
    if (ls.length > 0 && !ls.every(hasOdometerWindow)) continue;
    const pct = deadheadPctOver(ls, tripWeeks.get(k) ?? []);
    if (pct == null) continue;
    if (lowestDeadheadPct == null || pct < lowestDeadheadPct)
      lowestDeadheadPct = pct;
  }

  const biggestLoad = delivered.reduce<number | null>((m, l) => {
    const r = loadRevenue(l);
    return m == null || r > m ? r : m;
  }, null);

  return {
    bestWeekRevenue,
    lowestDeadheadPct,
    bestMpg: fuelStats(fuel, now).bestMpg,
    biggestLoad,
    mostLoadsInWeek,
  };
};

// ---------- earned trophies (phase-1 set) ----------
export interface Trophy {
  key: string;
  name: string;
  icon: string; // lucide/tabler-ish name the UI maps to
  detail: string;
}

export const earnedTrophies = (opts: {
  lifetimeMiles: number;
  loads: Load[];
  bestMpg: number | null;
  seasonMargin: Grade | null;
}): Trophy[] => {
  const out: Trophy[] = [];

  const mm = mileMilestone(opts.lifetimeMiles);
  if (mm.crossed != null && mm.label)
    out.push({ key: "mileclub", name: `${mm.label} Club`, icon: "medal", detail: mm.title ?? "Lifetime" });

  const byAgent = new Map<string, { name: string; count: number }>();
  for (const l of opts.loads)
    if (l.load_status === "delivered" && l.agent_id) {
      const a = byAgent.get(l.agent_id) ?? { name: l.agent, count: 0 };
      a.count += 1;
      byAgent.set(l.agent_id, a);
    }
  let topAgent: { name: string; count: number } | null = null;
  for (const a of byAgent.values())
    if (!topAgent || a.count > topAgent.count) topAgent = a;
  if (topAgent && topAgent.count >= 5)
    out.push({ key: "relationship", name: "Relationship Builder", icon: "users", detail: `${topAgent.name} ×${topAgent.count}` });

  const delivered = opts.loads.filter((l) => l.load_status === "delivered").length;
  const century = [500, 250, 100].find((m) => delivered >= m);
  if (century)
    out.push({ key: "century", name: `${century} Loads`, icon: "stack", detail: "Career" });

  if (opts.seasonMargin === "strong")
    out.push({ key: "strong-season", name: "Strong Season", icon: "trophy", detail: "Margin ≥ 27%" });

  if (opts.bestMpg != null)
    out.push({ key: "feather-foot", name: "Feather Foot", icon: "flame", detail: `${opts.bestMpg.toFixed(1)} mpg best` });

  return out;
};
