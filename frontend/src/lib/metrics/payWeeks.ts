// The accrual's clock (ADMIN-03 §5A, #500): the pay week runs Wednesday to
// Tuesday. A CLOSED pay week accrues ONCE, on the first snapshot taken after
// it closes — whichever weekday that is, because a money day can fall on a
// Wednesday. Each snapshot stores the latest pay week it accrued; every
// earlier closed week counts as accrued with it, so a skipped Friday can
// never accrue the same week twice.
import type { Load } from "@/types/load";
import { payWeekRange, loadGross } from "@/lib/metrics/rateTargets";
import { PAY_WEEK_START_DOW } from "@/lib/constants/targets";
import { isDelivered, isNeverRevenue } from "./status";

export interface PayWeek {
  start: string; // YYYY-MM-DD, the Wednesday
  end: string; // YYYY-MM-DD, the Tuesday (inclusive)
}

// A typed figure, or null when none was typed — blank and non-numeric are
// missing; a typed 0 is a number.
const typed = (v: number | string | null | undefined): number | null => {
  if (v == null || (typeof v === "string" && v.trim() === "")) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const utc = (s: string): Date => new Date(`${String(s).slice(0, 10)}T00:00:00Z`);
const addDays = (d: Date, n: number): Date => {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
};

// The pay week a calendar date falls in.
export const payWeekOf = (asOf: string): PayWeek => {
  const { start, end } = payWeekRange(utc(asOf), PAY_WEEK_START_DOW);
  return { start: ymd(start), end: ymd(addDays(end, -1)) };
};

// The closed pay weeks a snapshot dated `asOf` still owes: everything after
// the last accrued week up to the week that closed before asOf's own week.
// No history yet → only the latest closed week (the rules start now, not in
// January). Capped at the most recent `cap` weeks so a long gap can't pile
// up an absurd single accrual — `truncated` says when that happened.
export const weeksOwed = (
  asOf: string,
  lastAccrued: string | null,
  cap = 8,
): { weeks: PayWeek[]; truncated: boolean } => {
  const current = payWeekOf(asOf);
  const latestClosedStart = addDays(utc(current.start), -7);
  if (lastAccrued == null) {
    return { weeks: [{ start: ymd(latestClosedStart), end: ymd(addDays(latestClosedStart, 6)) }], truncated: false };
  }
  const weeks: PayWeek[] = [];
  let s = addDays(utc(payWeekOf(lastAccrued).start), 7);
  while (s.getTime() <= latestClosedStart.getTime()) {
    weeks.push({ start: ymd(s), end: ymd(addDays(s, 6)) });
    s = addDays(s, 7);
  }
  const truncated = weeks.length > cap;
  return { weeks: truncated ? weeks.slice(weeks.length - cap) : weeks, truncated };
};

export interface WeekMiles {
  loads: number;
  loadedMiles: number;
  deadheadMiles: number;
  miles: number; // loaded + deadhead
  noDeadhead: number; // loads carrying 0/unlogged deadhead — the flag
  loadNumbers: string[];
  // A pickup with no figure typed is NAMED, never counted as 0 miles (PLAN-06):
  // `miles` above is a sum over the figures that exist, so when either list is
  // non-empty the week's loads-based miles are incomplete (loadedMissing) or
  // the empty miles are under-counted (deadheadMissing).
  loadedMissing: string[]; // load numbers with no loaded_miles
  deadheadMissing: string[]; // load numbers with no deadhead_miles logged (blank, not a typed 0)
}

interface LoadLike {
  load_number?: string;
  load_status?: string;
  pickup_date: string;
  loaded_miles?: number | string | null;
  deadhead_miles?: number | string | null;
}

// Miles of the loads PICKED UP inside the given weeks — a load that spans
// two weeks lands in the week it started (nodded, rev 1 issue 2).
export const milesInWeeks = (loads: LoadLike[], weeks: PayWeek[]): WeekMiles => {
  const out: WeekMiles = { loads: 0, loadedMiles: 0, deadheadMiles: 0, miles: 0, noDeadhead: 0, loadNumbers: [], loadedMissing: [], deadheadMissing: [] };
  for (const l of loads) {
    if (isNeverRevenue(l)) continue; // never driven as planned — no miles to accrue
    const day = String(l.pickup_date ?? "").slice(0, 10);
    if (!weeks.some((w) => day >= w.start && day <= w.end)) continue;
    const loaded = typed(l.loaded_miles);
    const dead = typed(l.deadhead_miles);
    const name = l.load_number ?? "(no load number)";
    out.loads += 1;
    if (loaded == null) out.loadedMissing.push(name);
    else out.loadedMiles += loaded;
    if (dead == null) out.deadheadMissing.push(name);
    else out.deadheadMiles += dead;
    if (dead == null || dead <= 0) out.noDeadhead += 1;
    if (l.load_number) out.loadNumbers.push(l.load_number);
  }
  out.miles = out.loadedMiles + out.deadheadMiles;
  return out;
};

// ---- best week: one number (Nod Sheet 2026-11-04, §5) ----
// The Pulse said $13,295 (the best of seven pay weeks), the player card's TOP
// WEEK $14,773 (Monday weeks), the recap a third. Now one grouping: every
// COMPLETED pay week — Wednesday → Tuesday, a load counted by its delivery day
// — totalled at GROSS, the full customer rate the week was booked at.
export interface PayWeekTotal {
  week: PayWeek;
  gross: number;
  loads: number;
}

// Every completed pay week that delivered freight, oldest first. `today` is
// the operator's local day key; the week containing it is still running and
// never counts. `from` / `before` (day keys) bound the weeks by their start —
// the recap's range, [from, before).
export const completedPayWeekTotals = (
  loads: Load[],
  today: string,
  bounds: { from?: string; before?: string } = {},
): PayWeekTotal[] => {
  const running = payWeekOf(today).start;
  const totals = new Map<string, PayWeekTotal>();
  for (const l of loads) {
    if (!isDelivered(l) || !l.delivery_date) continue;
    const week = payWeekOf(String(l.delivery_date).slice(0, 10));
    if (week.start >= running) continue;
    if (bounds.from && week.start < bounds.from) continue;
    if (bounds.before && week.start >= bounds.before) continue;
    const t = totals.get(week.start) ?? { week, gross: 0, loads: 0 };
    t.gross += loadGross(l);
    t.loads += 1;
    totals.set(week.start, t);
  }
  return [...totals.values()].sort((a, b) => (a.week.start < b.week.start ? -1 : 1));
};

// The best completed pay week by gross — the one to beat. A tie goes to the
// later week. null until a week has completed with freight.
export const bestPayWeek = (
  loads: Load[],
  today: string,
  bounds: { from?: string; before?: string } = {},
): PayWeekTotal | null => {
  let best: PayWeekTotal | null = null;
  for (const t of completedPayWeekTotals(loads, today, bounds)) {
    if (t.gross <= 0) continue;
    if (best == null || t.gross >= best.gross) best = t;
  }
  return best;
};

// The month's first Friday is the new month's Friday: the snapshot runs, the
// accrual runs, the money day never does (ADMIN-03; enforced 2026-11-04 — it
// had been words only). UTC on the day key, like every date here.
export const isFirstFriday = (ymd: string): boolean => {
  const d = utc(ymd);
  return d.getUTCDay() === 5 && d.getUTCDate() <= 7;
};

// 'YYYY-MM-01' of the month a day falls in.
export const monthStartOf = (ymd: string): string => `${String(ymd).slice(0, 7)}-01`;

// "Sep 16–22" / "Sep 30–Oct 6" for labels.
export const weekLabel = (w: PayWeek): string => {
  const f = (s: string, withMonth: boolean) =>
    utc(s).toLocaleDateString("en-US", withMonth ? { month: "short", day: "numeric", timeZone: "UTC" } : { day: "numeric", timeZone: "UTC" });
  const sameMonth = w.start.slice(0, 7) === w.end.slice(0, 7);
  return `${f(w.start, true)}–${f(w.end, !sameMonth)}`;
};
