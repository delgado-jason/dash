// Dated per-diem rates — the pure rules (GL-136, Jason 2026-11-05: "Dated
// rates"; General Items Nod Sheet mock 1, call 1 lean A, nodded 2026-11-07).
//
// The rate in force on a day is the row with the latest effective_from on or
// before that day. A day BEFORE the first row has no rate: it is listed as
// missing and the total is withheld (null) — a blank is never zero, and a
// guessed rate would file a wrong deduction. Every date is a day key
// ("YYYY-MM-DD"); string comparison is day comparison, no timezone involved.
import type { PerDiemRate } from "@/types/perDiemRate";

export type PricedStatus = "full" | "half";

// A half day pays 75% of the full-day rate (IRS: departure and return days).
export const HALF_DAY_SHARE = 0.75;

export const sortRates = (rates: PerDiemRate[]): PerDiemRate[] =>
  [...rates].sort((a, b) =>
    a.effective_from < b.effective_from ? -1 : a.effective_from > b.effective_from ? 1 : 0,
  );

// The row in force on `day`, or null when no row starts on or before it.
export const rateInForce = (rates: PerDiemRate[], day: string): PerDiemRate | null => {
  let best: PerDiemRate | null = null;
  for (const r of rates) {
    if (r.effective_from <= day && (best == null || r.effective_from > best.effective_from)) best = r;
  }
  return best;
};

// One rate's share of a year: the days it priced and what they came to.
export interface PerDiemSegment {
  rate_id: string;
  effective_from: string;
  rate: number;
  note: string | null;
  fullDays: number;
  halfDays: number;
  amount: number; // fullDays × rate + halfDays × rate × 0.75, in dollars, unrounded
}

export interface PricedDays {
  segments: PerDiemSegment[]; // in effective_from order; only rates that priced a day
  missingDays: string[]; // sorted day keys that no rate covers — refused, never $0
  gross: number | null; // Σ segment amounts; null while any day is missing
}

// Price a set of counted days (full or half) by the rate in force on each.
export const priceDays = (
  days: Iterable<readonly [string, PricedStatus]>,
  rates: PerDiemRate[],
): PricedDays => {
  const sorted = sortRates(rates);
  const byId = new Map<string, PerDiemSegment>();
  const missing: string[] = [];
  for (const [day, status] of days) {
    const r = rateInForce(sorted, day);
    if (r == null) {
      missing.push(day);
      continue;
    }
    let seg = byId.get(r.rate_id);
    if (!seg) {
      seg = { rate_id: r.rate_id, effective_from: r.effective_from, rate: r.rate, note: r.note, fullDays: 0, halfDays: 0, amount: 0 };
      byId.set(r.rate_id, seg);
    }
    if (status === "full") seg.fullDays += 1;
    else seg.halfDays += 1;
  }
  const segments = [...byId.values()]
    .sort((a, b) => (a.effective_from < b.effective_from ? -1 : a.effective_from > b.effective_from ? 1 : 0))
    .map((s) => ({ ...s, amount: s.fullDays * s.rate + s.halfDays * s.rate * HALF_DAY_SHARE }));
  missing.sort();
  const gross = missing.length > 0 ? null : segments.reduce((sum, s) => sum + s.amount, 0);
  return { segments, missingDays: missing, gross };
};

// ---- words ----

// "Jan 1, 2026" from a day key, read in UTC so the day never shifts.
export const dayWords = (key: string): string =>
  new Date(`${key.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

// "$80" for a whole-dollar rate, "$69.50" otherwise.
export const moneyRate = (rate: number): string =>
  Number.isInteger(rate) ? `$${rate}` : `$${rate.toFixed(2)}`;

// "22 full + 3 half days × $80 (from Jan 1, 2026)" — the deduction line, per rate.
export const segmentWords = (s: PerDiemSegment): string =>
  `${s.fullDays} full + ${s.halfDays} half days × ${moneyRate(s.rate)} (from ${dayWords(s.effective_from)})`;

// "12 days (Jan 1 – Jan 12, 2024)" · "1 day (Jan 3, 2024)" — the days no rate covers.
export const missingDaysWords = (days: string[]): string => {
  if (days.length === 0) return "";
  const sorted = [...days].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (sorted.length === 1) return `1 day (${dayWords(first)})`;
  return `${sorted.length} days (${dayWords(first)} – ${dayWords(last)})`;
};

// "$69 from Jan 1, 2025 · $80 from Jan 1, 2026" — every rate on file, oldest first.
export const ratesWords = (rates: PerDiemRate[]): string =>
  sortRates(rates)
    .map((r) => `${moneyRate(r.rate)} from ${dayWords(r.effective_from)}`)
    .join(" · ");
