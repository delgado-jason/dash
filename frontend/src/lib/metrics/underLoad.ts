import type { Load } from "@/types/load";

const DAY = 86_400_000;

// Distinct calendar days the truck was under a load — each delivered load's
// pickup→delivery span, inclusive — optionally bounded to [startKey, endKey].
// This is the honest basis for utilization: a day counts once no matter how many
// loads overlap it, and a multi-day haul counts every day it was working.
export const underLoadDaySet = (
  loads: Load[],
  startKey: string | null,
  endKey: string,
): Set<string> => {
  const set = new Set<string>();
  for (const l of loads) {
    if (l.load_status !== "delivered" || !l.pickup_date) continue;
    const s = l.pickup_date.slice(0, 10);
    const e = (l.delivery_date ?? l.pickup_date).slice(0, 10);
    const cur = new Date(`${s}T00:00:00Z`);
    const end = new Date(`${e}T00:00:00Z`);
    let guard = 0;
    while (cur <= end && guard++ < 500) {
      const k = cur.toISOString().slice(0, 10);
      if ((!startKey || k >= startKey) && k <= endKey) set.add(k);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  return set;
};

// The earliest delivered-load pickup day ("YYYY-MM-DD"), or null. The utilization
// window start for a driver-scoped view (no truck in-service date needed).
export const firstDeliveredPickup = (loads: Load[]): string | null =>
  loads
    .filter((l) => l.load_status === "delivered" && l.pickup_date)
    .map((l) => l.pickup_date.slice(0, 10))
    .sort()[0] ?? null;

// Lengths of each consecutive-day run of under-load days (gaps-and-islands) — the
// stretches the truck rolled without a break. Feeds the Days Under Load patch.
export const underLoadRuns = (loads: Load[]): number[] => {
  const days = [...underLoadDaySet(loads, null, "9999-12-31")].sort();
  const runs: number[] = [];
  let runLen = 0;
  let prevMs = -Infinity;
  for (const d of days) {
    const ms = Date.parse(`${d}T00:00:00Z`);
    if (ms - prevMs === DAY) runLen++;
    else {
      if (runLen > 0) runs.push(runLen);
      runLen = 1;
    }
    prevMs = ms;
  }
  if (runLen > 0) runs.push(runLen);
  return runs;
};
