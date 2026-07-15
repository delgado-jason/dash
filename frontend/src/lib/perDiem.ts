import type { Load } from "@/types/load";
import type { PerDiemStatus } from "@/types/perDiem";

const pad = (n: number) => String(n).padStart(2, "0");

// "YYYY-MM-DD" from a local Date (calendar day, no timezone drift).
export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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

// A day's effective status: a manual mark wins; otherwise an inferred-out day is
// a full day; otherwise home.
export const effectiveStatus = (
  key: string,
  manual: Map<string, PerDiemStatus>,
  inferred: Set<string>,
): PerDiemStatus => {
  const m = manual.get(key);
  if (m) return m;
  return inferred.has(key) ? "full" : "home";
};

export interface PerDiemSummary {
  fullDays: number;
  halfDays: number;
  inferredCount: number; // inferred-out days not yet manually confirmed
  deductible: number;
}

// Full days at the rate, half days at 75%, times the deductible share.
export const computePerDiem = (
  manual: Map<string, PerDiemStatus>,
  inferred: Set<string>,
  rate: number,
  deductPct: number,
): PerDiemSummary => {
  let fullDays = 0;
  let halfDays = 0;
  let inferredCount = 0;
  const keys = new Set<string>([...manual.keys(), ...inferred]);
  for (const k of keys) {
    const s = effectiveStatus(k, manual, inferred);
    if (s === "full") fullDays++;
    else if (s === "half") halfDays++;
    if (!manual.has(k) && inferred.has(k)) inferredCount++;
  }
  const deductible = Math.round(
    (fullDays * rate + halfDays * rate * 0.75) * deductPct,
  );
  return { fullDays, halfDays, inferredCount, deductible };
};

// The next status when a day is tapped: unmarked → full → half → home → clear.
// null means "clear the manual mark" (back to inferred/home).
export const nextStatus = (
  current: PerDiemStatus | undefined,
): PerDiemStatus | null => {
  if (!current) return "full";
  if (current === "full") return "half";
  if (current === "half") return "home";
  return null; // 'home' → clear
};
