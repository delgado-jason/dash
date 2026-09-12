// Avg RPM = ALL-IN GROSS (decision 2): Σ loadGross ÷ Σ(loaded + deadhead
// miles) over DELIVERED loads picked up in the trailing 12 months. Gross
// because agents are graded on what they PAY; all-in because that is the
// OPS-02 verdict on a load. A load with no deadhead logged contributes its
// loaded miles only and marks the average `partial`. No miles → null, never
// $0.00 — "no miles recorded" is not "a dollar a mile".
import type { Load } from "@/types/load";
import { loadGross } from "@/lib/metrics/rateTargets";
import { DAY_MS, keyOf, utcDayKey } from "./dayKeys";

export const RPM_WINDOW_DAYS = 365;

export interface AgentRpm {
  rpm: number | null;
  loads: number; // delivered loads inside the window
  partial: boolean; // at least one load had no deadhead logged
  gross: number;
}

const isDelivered = (l: Load, agentId: string): boolean =>
  l.agent_id === agentId && l.load_status === "delivered";

export const agentAllInRpm = (loads: Load[], agentId: string, now: Date): AgentRpm => {
  const toKey = utcDayKey(now);
  const fromKey = utcDayKey(new Date(now.getTime() - RPM_WINDOW_DAYS * DAY_MS));
  let gross = 0;
  let miles = 0;
  let n = 0;
  let partial = false;
  for (const l of loads) {
    if (!isDelivered(l, agentId) || !l.pickup_date) continue;
    const k = keyOf(l.pickup_date);
    if (k < fromKey || k > toKey) continue;
    n++;
    gross += loadGross(l);
    miles += Number(l.loaded_miles) || 0;
    if (l.deadhead_miles == null) partial = true;
    else miles += Number(l.deadhead_miles) || 0;
  }
  return { rpm: miles > 0 ? gross / miles : null, loads: n, partial, gross };
};

// Lifetime delivered loads — the ≥3 "established footprint" gate reads this,
// not the RPM window.
export const deliveredCount = (loads: Load[], agentId: string): number => {
  let n = 0;
  for (const l of loads) if (isDelivered(l, agentId)) n++;
  return n;
};

// The most recent load day for the agent — delivery when there is one, else
// pickup — over non-cancelled loads. null when they never ran.
export const lastLoadKey = (loads: Load[], agentId: string): string | null => {
  let max: string | null = null;
  for (const l of loads) {
    if (l.agent_id !== agentId || l.load_status === "cancelled") continue;
    const raw = l.delivery_date ?? l.pickup_date;
    if (!raw) continue;
    const k = keyOf(raw);
    if (max == null || k > max) max = k;
  }
  return max;
};
