// Closed weeks re-true (Nod Sheet 2026-11-04, §4 · call 8, lean A).
//
// The snapshot's stored miles are the record of what MOVED to Maintenance —
// they win. But the odometer chain keeps growing after the fact: a home trip
// logged a week late, a fill typed on Sunday, a shop visit entered from the
// invoice. So every closed pay week that has already accrued is re-read from
// the chain as it stands today, and the difference is a CATCH-UP — miles the
// truck rolled that never reached Maintenance (or, after a fixed typo, miles
// that moved and shouldn't have). It rides into the next accrual, once, and
// the miles stored on that snapshot close the gap, because the whole rule is
// one invariant:
//
//     Σ miles stored on the snapshots  =  Σ chain miles over every accrued week
//
// Prod on Nov 4, 2026: six accrued weeks (Sep 16 – Oct 27) stored 8,052 mi;
// the chain says 9,972 → 1,920 mi · $614.40 never accrued (trip 11's 648 home
// miles logged Oct 19, after the Oct 16 snapshot; trip 12's 46 logged Oct 31).
//
// Both pages call this with the same inputs, so they agree by construction:
// the Plan orders the catch-up, the board books it the same Friday.
import { payWeekOf, milesInWeeks, weekLabel, type PayWeek } from "./payWeeks";
import { weekOdometerMiles, type OdometerReading } from "./odometer";

// What a snapshot recorded about its accrual: the miles it moved and the
// latest pay week it covered (every earlier closed week accrued with it).
export interface AccrualRecord {
  as_of: string;
  miles: number | string | null;
  pay_week_start: string | null;
}

interface LoadLike {
  load_number?: string;
  load_status?: string;
  pickup_date: string;
  loaded_miles?: number | string | null;
  deadhead_miles?: number | string | null;
}

export interface RetrueWeek {
  week: PayWeek;
  chain: number; // the week by odometer today (the loads when no reading predates it)
  source: "odometer" | "loads";
  stored: number; // the miles a snapshot recorded for it (0 when it accrued with a later week)
  movedOn: string | null; // the as_of of the snapshot that moved it
}

export interface Retrue {
  weeks: RetrueWeek[]; // every closed pay week the snapshots have accrued, first → last
  label: string; // "Sep 16–Oct 27"
  storedMiles: number; // Σ miles the snapshots recorded — what moved
  chainMiles: number; // the same weeks read from the chain today
  deltaMiles: number; // chain − stored: > 0 never accrued, < 0 over-accrued
  byLoads: number; // weeks read from the loads for want of a reading
}

const day = (v: string | null | undefined): string => String(v ?? "").slice(0, 10);
const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const utc = (s: string): Date => new Date(`${s}T00:00:00Z`);
const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const plusDays = (s: string, n: number): string => {
  const d = utc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};

// The accruing snapshots in week order, each with the span of closed weeks it
// covered: from the week after the previous accrual's up to its own. The
// stored miles sit on the latest week; the earlier ones accrued with it at 0.
export const accrualsByWeek = (records: AccrualRecord[]): Map<string, { stored: number; movedOn: string; own: boolean }> => {
  const out = new Map<string, { stored: number; movedOn: string; own: boolean }>();
  const accruing = records
    .filter((r) => r.pay_week_start)
    .map((r) => ({ as_of: day(r.as_of), week: payWeekOf(day(r.pay_week_start)).start, miles: num(r.miles) ?? 0 }))
    .sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : a.as_of < b.as_of ? -1 : 1));
  let prev: string | null = null;
  for (const r of accruing) {
    if (prev != null) {
      for (let w = plusDays(prev, 7); w < r.week; w = plusDays(w, 7)) {
        if (!out.has(w)) out.set(w, { stored: 0, movedOn: r.as_of, own: false });
      }
    }
    // Two snapshots naming the same week (a re-typed Friday): both moved money.
    const cur = out.get(r.week);
    out.set(r.week, { stored: (cur?.own ? cur.stored : 0) + r.miles, movedOn: r.as_of, own: true });
    prev = r.week;
  }
  return out;
};

// Re-read every accrued week from the chain and net it against what moved.
// null until something has accrued. Weeks still open today are never
// re-trued — they haven't accrued yet.
export const retrueAccrued = (
  records: AccrualRecord[],
  readings: OdometerReading[],
  loads: LoadLike[],
  today: string,
): Retrue | null => {
  const byWeek = accrualsByWeek(records);
  if (byWeek.size === 0) return null;
  const starts = [...byWeek.keys()].sort();
  const weeks: RetrueWeek[] = [];
  let chainMiles = 0;
  let byLoads = 0;
  for (const start of starts) {
    const week: PayWeek = { start, end: plusDays(start, 6) };
    if (!(week.end < day(today))) continue;
    const odo = weekOdometerMiles(readings, week);
    let chain: number;
    let source: RetrueWeek["source"];
    if (odo.miles == null) {
      chain = milesInWeeks(loads, [week]).miles;
      source = "loads";
      byLoads += 1;
    } else {
      chain = odo.miles;
      source = "odometer";
    }
    chainMiles += chain;
    const rec = byWeek.get(start)!;
    weeks.push({ week, chain, source, stored: rec.stored, movedOn: rec.movedOn });
  }
  if (weeks.length === 0) return null;
  // Every mile a snapshot recorded counts as moved — with or without a week
  // tag, so a catch-up typed on its own (no week owed) still closes the gap.
  const storedMiles = records.reduce((s, r) => s + (num(r.miles) ?? 0), 0);
  const first = weeks[0].week;
  const last = weeks[weeks.length - 1].week;
  return {
    weeks,
    label: weeks.length === 1 ? weekLabel(first) : weekLabel({ start: first.start, end: last.end }),
    storedMiles,
    chainMiles,
    deltaMiles: Math.round(chainMiles - storedMiles),
    byLoads,
  };
};

// "1,920 mi the chain found after the fact — Sep 16–Oct 27 moved 8,052 mi, the
// odometer says 9,972" · "248 mi over-accrued — …" · null when it nets to zero.
export const retrueWords = (r: Retrue | null): string | null => {
  if (!r || r.deltaMiles === 0) return null;
  const fmt = (n: number): string => Math.round(Math.abs(n)).toLocaleString("en-US");
  const head = r.deltaMiles > 0 ? `${fmt(r.deltaMiles)} mi the chain found after the fact` : `${fmt(r.deltaMiles)} mi over-accrued`;
  const tail = r.byLoads > 0 ? ` (${r.byLoads} week${r.byLoads === 1 ? "" : "s"} by the loads, no reading before ${r.byLoads === 1 ? "it" : "them"})` : "";
  return `${head} — ${r.label} moved ${fmt(r.storedMiles)} mi, the odometer says ${fmt(r.chainMiles)}${tail}`;
};
