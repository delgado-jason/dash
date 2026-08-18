import type { Load } from "@/types/load";
import type { PerDiemStatus } from "@/types/perDiem";

const pad = (n: number) => String(n).padStart(2, "0");

// "YYYY-MM-DD" from a local Date (calendar day, no timezone drift).
export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The default flipped on this day (Jason, 2026-08-18): from here forward an
// UNMARKED day is a FULL day out — he only marks home time and half days.
// Days BEFORE the boundary keep the original rules (home unless a delivered
// load covers the day or he marked it) so the history he entered under those
// rules — and the deduction it already produced — doesn't silently rewrite
// itself into months of falsely-claimed out-days. The same boundary governs
// the rig card's home/idle split (truckMetrics, fleet): one mental model,
// "I'm out unless I said home."
export const FULL_DEFAULT_SINCE = "2026-08-18";

// Days inferred "out" from delivered loads — every calendar day a load's
// pickup→delivery span covers, within `year` and not after `cap` (today, or the
// year's end for a past year). Returns a Set of "YYYY-MM-DD".
export const inferredOutDays = (
  loads: Load[],
  year: number,
  cap: Date,
): Set<string> => {
  const out = new Set<string>();
  const capKey = dayKey(cap);
  const yr = String(year);
  for (const l of loads) {
    if (l.load_status !== "delivered" || !l.pickup_date) continue;
    const start = l.pickup_date.slice(0, 10);
    const end = (l.delivery_date ?? l.pickup_date).slice(0, 10);
    const cur = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    // guard against a bad range (delivery before pickup)
    let guard = 0;
    while (cur <= endDate && guard++ < 400) {
      const k = dayKey(cur);
      if (k.slice(0, 4) === yr && k <= capKey) out.add(k);
      cur.setDate(cur.getDate() + 1);
    }
  }
  return out;
};

// A day's effective status: a manual mark wins; from the boundary on an
// unmarked day is FULL; before it, an inferred-out day is full, else home.
export const effectiveStatus = (
  key: string,
  manual: Map<string, PerDiemStatus>,
  inferred: Set<string>,
): PerDiemStatus => {
  const m = manual.get(key);
  if (m) return m;
  if (key >= FULL_DEFAULT_SINCE) return "full";
  return inferred.has(key) ? "full" : "home";
};

export interface PerDiemSummary {
  fullDays: number;
  halfDays: number;
  inferredCount: number; // inferred-out days not yet manually confirmed
  deductible: number;
}

// Full days at the rate, half days at 75%, times the deductible share.
// Walks every calendar day of `year` through `cap` (today, or the year's end
// for a past year) — it must, because from the boundary on the UNMARKED days
// are the full days. Marks past the cap (planned home time) don't count yet.
export const computePerDiem = (
  manual: Map<string, PerDiemStatus>,
  inferred: Set<string>,
  rate: number,
  deductPct: number,
  year: number,
  cap: Date,
): PerDiemSummary => {
  let fullDays = 0;
  let halfDays = 0;
  let inferredCount = 0;
  const capKey = dayKey(cap);
  const cur = new Date(year, 0, 1);
  while (cur.getFullYear() === year) {
    const k = dayKey(cur);
    if (k > capKey) break;
    const s = effectiveStatus(k, manual, inferred);
    if (s === "full") fullDays++;
    else if (s === "half") halfDays++;
    // The confirm-nudge only means something in the pre-boundary era — after
    // it, unmarked IS the claim, there's nothing to confirm.
    if (k < FULL_DEFAULT_SINCE && !manual.has(k) && inferred.has(k))
      inferredCount++;
    cur.setDate(cur.getDate() + 1);
  }
  const deductible = Math.round(
    (fullDays * rate + halfDays * rate * 0.75) * deductPct,
  );
  return { fullDays, halfDays, inferredCount, deductible };
};

// The next status when a day is tapped. null means "clear the manual mark"
// (back to the day's default). Pre-boundary: unmarked → full → half → home →
// clear. From the boundary on, unmarked already READS full, so marking "full"
// is a no-op — the cycle skips straight to the useful marks (half → home →
// clear); a legacy explicit 'full' row folds into the same path.
export const nextStatus = (
  current: PerDiemStatus | undefined,
  autoFull = false,
): PerDiemStatus | null => {
  if (autoFull) {
    if (!current || current === "full") return "half";
    if (current === "half") return "home";
    return null; // 'home' → clear (back to auto-full)
  }
  if (!current) return "full";
  if (current === "full") return "half";
  if (current === "half") return "home";
  return null; // 'home' → clear
};
