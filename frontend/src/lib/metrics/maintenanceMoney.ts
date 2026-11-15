// THE MONEY ON THE MAINTENANCE PAGE (the Maintenance sheet, nodded 2026-11-15):
// what a clock cost the last time it was done, what the next 90 days will
// take against the Maintenance bucket, what the books say against the log,
// and what a day in the shop costs. Pure — every figure reads only the log,
// the P&L you filed, the Plan's accounts and the trips you logged.
//
// House rules that shape everything here:
//   • "last time" is always the VISIT — its total, its shop, how many clocks it
//     reset. A $840 PM that reset six clocks cannot honestly be split six ways,
//     so the page never prints a per-clock figure it invented.
//   • null is "no data", never 0: a month with no P&L filed is "no P&L filed",
//     a clock never done has no last visit, a bucket never typed has no balance.
import type { MaintenanceItem, MaintenanceService } from "@/types/maintenance";
import type { ExpensePeriod } from "@/types/expense";
import type { Trip } from "@/types/trip";
import type { AccountRow, SnapshotRow } from "@/services/planService";
import type { Due } from "./maintenance";
import type { ApuProjection } from "./apuHours";
import { localDayKey, DAY_MS } from "@/lib/dates/dayKeys";

// ------------------------------------------------------------- last time

export interface LastVisit {
  service_id: string;
  day: string; // 'YYYY-MM-DD'
  vendor: string | null;
  cost: number | null; // null = the visit was logged without a price
  clocks: number; // how many clocks that visit reset — the figure is theirs together
  warrantyUntil: string | null; // 'YYYY-MM-DD' — the visit's parts/labour warranty, when known
}

// The newest service that completed each clock. The API lists services newest
// first, so on a same-day tie the first seen wins — the one filed last.
export const lastVisitByItem = (services: MaintenanceService[]): Map<string, LastVisit> => {
  const out = new Map<string, LastVisit>();
  for (const s of services) {
    for (const id of s.item_ids) {
      const have = out.get(id);
      if (have && have.day >= s.service_date) continue;
      out.set(id, {
        service_id: s.service_id,
        day: s.service_date,
        vendor: s.vendor,
        cost: s.cost,
        clocks: s.item_ids.length,
        warrantyUntil: s.warranty_until ?? null,
      });
    }
  }
  return out;
};

// --------------------------------------------------------- the next 90 days

export interface DueRow {
  item: MaintenanceItem;
  due: Due;
}

export interface NinetyDays {
  horizonDays: number;
  clocks: number; // clocks overdue now or projected due inside the horizon
  visits: LastVisit[]; // the visits that last did them, each once
  total: number; // those visits' prices together
  unpriced: number; // clocks with no last visit (or one with no price) — not in `total`
}

const shiftKey = (now: Date, days: number): string =>
  localDayKey(new Date(now.getTime() + days * DAY_MS));

// What is coming: every clock overdue now, or whose projected date lands
// inside the horizon, with the visits that last did them. The total is the
// sum of those VISITS, each counted once — a real history, not a per-clock
// guess — and it runs slightly high when a visit also did unrelated work.
export const dueWithin = (
  rows: DueRow[],
  last: Map<string, LastVisit>,
  now: Date,
  horizonDays = 90,
): NinetyDays => {
  const horizon = shiftKey(now, horizonDays);
  const seen = new Map<string, LastVisit>();
  let clocks = 0;
  let unpriced = 0;
  for (const r of rows) {
    if (!r.item.active) continue;
    const inside =
      r.due.level === "overdue" || (r.due.etaDate != null && r.due.etaDate <= horizon);
    if (!inside) continue;
    clocks++;
    const v = last.get(r.item.item_id);
    if (!v || v.cost == null) {
      unpriced++;
      continue;
    }
    if (!seen.has(v.service_id)) seen.set(v.service_id, v);
  }
  const visits = [...seen.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  return {
    horizonDays,
    clocks,
    visits,
    total: visits.reduce((s, v) => s + (v.cost ?? 0), 0),
    unpriced,
  };
};

// ---------------------------------------------------------- books vs log

export type BooksWord =
  | "no P&L filed"
  | "nothing logged"
  | "exact"
  | "matches"
  | "something unlogged"
  | "more logged than filed";

export interface BooksRow {
  month: string; // 'YYYY-MM'
  books: number | null; // the P&L's repairs & maintenance; null = no P&L filed
  logged: number | null; // the log's priced visits; null = nothing logged
  gap: number | null; // logged − books, only when both are known
  says: BooksWord;
}

export interface BooksVsLog {
  year: number;
  rows: BooksRow[];
  books: number; // over the filed months
  logged: number; // over every month
  filedMonths: number;
}

// "Matches" has a tolerance: a wash paid in cash or a rounding on the
// statement is not a gap worth a word. $150 or 10% of the month, whichever is
// more.
const tolerance = (books: number): number => Math.max(150, books * 0.1);

const wordFor = (books: number | null, logged: number | null): BooksWord => {
  if (books == null) return "no P&L filed";
  if (logged == null) return books > 0 ? "nothing logged" : "matches";
  const gap = logged - books;
  // Half a cent is exact: a sum of priced visits carries floating-point dust.
  if (Math.abs(gap) <= tolerance(books)) return Math.abs(gap) < 0.005 ? "exact" : "matches";
  return gap < 0 ? "something unlogged" : "more logged than filed";
};

// The P&L's repairs & maintenance line beside what the log holds, month by
// month through the current month. A month with no P&L is said so — never
// "matches" — and a filed month with no repairs line is $0 in the books.
export const booksVsLog = (
  periods: ExpensePeriod[],
  services: MaintenanceService[],
  year: number,
  now: Date,
): BooksVsLog => {
  const booksBy = new Map<string, number>();
  for (const p of periods) {
    const key = String(p.period_month).slice(0, 7);
    if (!key.startsWith(String(year))) continue;
    booksBy.set(key, p.repairs_total ?? 0);
  }
  const loggedBy = new Map<string, number>();
  for (const s of services) {
    const key = s.service_date.slice(0, 7);
    if (!key.startsWith(String(year))) continue;
    loggedBy.set(key, (loggedBy.get(key) ?? 0) + (s.cost ?? 0));
  }
  const today = localDayKey(now);
  const lastMonth = today.startsWith(String(year)) ? Number(today.slice(5, 7)) : 12;
  const rows: BooksRow[] = [];
  for (let m = 1; m <= lastMonth; m++) {
    const month = `${year}-${String(m).padStart(2, "0")}`;
    const books = booksBy.has(month) ? (booksBy.get(month) as number) : null;
    const logged = loggedBy.has(month) ? (loggedBy.get(month) as number) : null;
    rows.push({
      month,
      books,
      logged,
      gap: books != null && logged != null ? logged - books : null,
      says: wordFor(books, logged),
    });
  }
  return {
    year,
    rows,
    books: rows.reduce((s, r) => s + (r.books ?? 0), 0),
    logged: rows.reduce((s, r) => s + (r.logged ?? 0), 0),
    filedMonths: rows.filter((r) => r.books != null).length,
  };
};

// -------------------------------------------------------------- shop days

export interface ShopDays {
  days: number;
  dates: string[]; // 'YYYY-MM-DD', oldest first
  cost: number | null; // days × the ladder's target day; null without a target
}

// A day the truck went to the shop is a day it earned nothing — read from the
// trips you already log (purpose "shop"), one per calendar day.
export const shopDays = (trips: Trip[], year: number, dayTarget: number | null): ShopDays => {
  const days = new Set<string>();
  for (const t of trips) {
    if (t.trip_purpose !== "shop" || t.status === "cancelled" || !t.trip_date) continue;
    const key = String(t.trip_date).slice(0, 10);
    if (key.startsWith(String(year))) days.add(key);
  }
  const dates = [...days].sort();
  return {
    days: dates.length,
    dates,
    cost: dayTarget != null && dayTarget > 0 ? dates.length * dayTarget : null,
  };
};

// ------------------------------------------------------------- the bucket

export interface Bucket {
  balance: number;
  asOf: string; // 'YYYY-MM-DD' — the snapshot it was typed on
}

// The Maintenance account's balance on the latest Friday snapshot — the Plan
// page's own figure, read the same way (by day, then by the clock it was typed).
export const maintenanceBucket = (accounts: AccountRow[], snapshots: SnapshotRow[]): Bucket | null => {
  const acct = accounts.find((a) => a.role === "maintenance" && a.active) ?? accounts.find((a) => a.role === "maintenance");
  if (!acct) return null;
  const sorted = [...snapshots].sort((x, y) => {
    const a = String(x.as_of).slice(0, 10);
    const b = String(y.as_of).slice(0, 10);
    if (a !== b) return a < b ? -1 : 1;
    const ca = String(x.created_at ?? "");
    const cb = String(y.created_at ?? "");
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });
  for (let i = sorted.length - 1; i >= 0; i--) {
    const row = sorted[i].balances?.find((b) => b.account_id === acct.account_id);
    if (row && row.balance != null && row.balance !== "") {
      const n = Number(row.balance);
      if (Number.isFinite(n)) return { balance: n, asOf: String(sorted[i].as_of).slice(0, 10) };
    }
  }
  return null;
};

// ------------------------------------------------------ assumed baselines

// A clock whose baseline was SET at the truck's in-service day and which no
// service has completed since is counting from an assumption, and wears a "~"
// until a real service replaces it. No column needed: the rule is readable
// from the clock and the log.
export const baselineAssumed = (
  item: MaintenanceItem,
  inServiceDay: string | null,
  last: Map<string, LastVisit>,
): boolean =>
  inServiceDay != null && item.last_done_date === inServiceDay && !last.has(item.item_id);

// ----------------------------------------------------------- the meter prompt

export const STALE_AFTER_ROAD_DAYS = 30;

// When to ask for the APU's hour meter: no reading at all, a projection that
// has carried for more than a month of road days, or an APU clock that is
// close while its figure is still a projection.
export const meterPrompt = (
  apu: ApuProjection,
  roadDaysSinceRead: number | null,
  apuRows: DueRow[],
  staleAfter = STALE_AFTER_ROAD_DAYS,
): string | null => {
  if (apu.hours == null) return "read the APU's hour meter — no reading on file, so its clocks cannot count";
  if (roadDaysSinceRead != null && roadDaysSinceRead > staleAfter)
    return `read the meter — the projection is ${roadDaysSinceRead} road days old`;
  const close = apuRows.some((r) => r.due.level === "overdue" || r.due.level === "soon");
  if (close && apu.estimated) return "an APU clock is close and its hours are projected — read the meter at the next stop";
  return null;
};

// A clock whose last visit is still under warranty says so before the owner
// pays twice (the Maintenance sheet, call 7).
export const underWarranty = (v: LastVisit | undefined, today: string): boolean =>
  v?.warrantyUntil != null && v.warrantyUntil >= today;
