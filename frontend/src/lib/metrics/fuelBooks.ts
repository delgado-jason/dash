// The books vs the log — the P&L's Fuel line beside what the fuel log says,
// by month, the gaps named. The same strip the Maintenance page got on
// 2026-11-15; fuel is three times the line. Pure.
//
// Unlike maintenance nothing re-bases on the books: the thirty-day rate keeps
// reading the pump, because fuel is priced by the receipt. This strip is the
// check — receipts the accountant did not see, or card settlements landing a
// month late.

export interface FuelLogLike {
  fuel_date: string; // 'YYYY-MM-DD'
  gallons: number | string;
  price_per_gallon: number | string;
}

export interface FuelPeriodLike {
  period_month: string; // 'YYYY-MM-DD' (the first of the month) or 'YYYY-MM…'
  fuel_total?: number | null; // null = the filed month carries no Fuel line
}

export type FuelBooksTone = "quiet" | "match" | "gap";

export interface FuelBooksRow {
  month: string; // 'YYYY-MM'
  logged: number; // Σ gallons × price that month, every kind
  books: number | null; // the P&L's Fuel line; null = no P&L filed for the month
  read: string; // the sentence
  tone: FuelBooksTone;
}

// The gap that is not a gap: $25, or 1% of the larger figure — a receipt's
// rounding, not a missing receipt. Tight on purpose: the nodded mock named a
// $120 gap on a $3,284 month, and fuel is three times the repairs line the
// Maintenance strip reads with its wider band.
const tolerance = (a: number, b: number): number => Math.max(25, 0.01 * Math.max(a, b));

const monthKey = (iso: string): string => String(iso).slice(0, 7);
const money0 = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;
const dayWords = (iso: string): string =>
  new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * One row per month from the log's first month to `now`'s month, newest
 * first. A month with neither a fill nor a filed P&L is left out.
 */
export const fuelBooksVsLog = (
  entries: FuelLogLike[],
  periods: FuelPeriodLike[],
  now: Date,
): FuelBooksRow[] => {
  const logged = new Map<string, number>();
  let firstFill: string | null = null;
  for (const e of entries) {
    const day = String(e.fuel_date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const k = day.slice(0, 7);
    logged.set(k, (logged.get(k) ?? 0) + (Number(e.gallons) || 0) * (Number(e.price_per_gallon) || 0));
    if (firstFill == null || day < firstFill) firstFill = day;
  }
  if (firstFill == null) return [];
  // A filed month with no Fuel line reads $0 — the accountant filed the month
  // and put nothing on that line; that is a fact, not a missing month.
  const books = new Map<string, number>();
  for (const p of periods) {
    const k = monthKey(p.period_month);
    if (!/^\d{4}-\d{2}$/.test(k)) continue;
    books.set(k, (books.get(k) ?? 0) + (p.fuel_total == null ? 0 : Number(p.fuel_total) || 0));
  }
  const cur = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const firstMonth = firstFill.slice(0, 7);
  const months = new Set<string>([...logged.keys(), ...[...books.keys()].filter((k) => k >= firstMonth && k <= cur)]);
  const rows: FuelBooksRow[] = [];
  for (const k of [...months].sort().reverse()) {
    const l = logged.get(k) ?? 0;
    const b = books.has(k) ? (books.get(k) as number) : null;
    let read: string;
    let tone: FuelBooksTone;
    if (k === firstMonth && firstFill.slice(8, 10) !== "01") {
      read = `the log began ${dayWords(firstFill)} — a partial month, not read`;
      tone = "quiet";
    } else if (b == null) {
      read = "no P&L filed yet";
      tone = "quiet";
    } else if (Math.abs(l - b) <= tolerance(l, b)) {
      read = Math.round(l) === Math.round(b) ? "exact" : "matches";
      tone = "match";
    } else if (l > b) {
      read = `${money0(l - b)} more logged than filed`;
      tone = "gap";
    } else {
      read = `${money0(b - l)} more in the books`;
      tone = "gap";
    }
    rows.push({ month: k, logged: l, books: b, read, tone });
  }
  return rows;
};
