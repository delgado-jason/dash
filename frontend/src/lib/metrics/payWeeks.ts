// The accrual's clock (ADMIN-03 §5A, #500): the pay week runs Wednesday to
// Tuesday. A CLOSED pay week accrues ONCE, on the first snapshot taken after
// it closes — whichever weekday that is, because a money day can fall on a
// Wednesday. Each snapshot stores the latest pay week it accrued; every
// earlier closed week counts as accrued with it, so a skipped Friday can
// never accrue the same week twice.
import { payWeekRange } from "@/lib/metrics/rateTargets";
import { PAY_WEEK_START_DOW } from "@/lib/constants/targets";

export interface PayWeek {
  start: string; // YYYY-MM-DD, the Wednesday
  end: string; // YYYY-MM-DD, the Tuesday (inclusive)
}

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
  const out: WeekMiles = { loads: 0, loadedMiles: 0, deadheadMiles: 0, miles: 0, noDeadhead: 0, loadNumbers: [] };
  for (const l of loads) {
    if (l.load_status === "cancelled") continue; // never driven — no miles to accrue
    const day = String(l.pickup_date ?? "").slice(0, 10);
    if (!weeks.some((w) => day >= w.start && day <= w.end)) continue;
    const loaded = Number(l.loaded_miles ?? 0) || 0;
    const dead = Number(l.deadhead_miles ?? 0) || 0;
    out.loads += 1;
    out.loadedMiles += loaded;
    out.deadheadMiles += dead;
    if (dead <= 0) out.noDeadhead += 1;
    if (l.load_number) out.loadNumbers.push(l.load_number);
  }
  out.miles = out.loadedMiles + out.deadheadMiles;
  return out;
};

// "Sep 16–22" / "Sep 30–Oct 6" for labels.
export const weekLabel = (w: PayWeek): string => {
  const f = (s: string, withMonth: boolean) =>
    utc(s).toLocaleDateString("en-US", withMonth ? { month: "short", day: "numeric", timeZone: "UTC" } : { day: "numeric", timeZone: "UTC" });
  const sameMonth = w.start.slice(0, 7) === w.end.slice(0, 7);
  return `${f(w.start, true)}–${f(w.end, !sameMonth)}`;
};
