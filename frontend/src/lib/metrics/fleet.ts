import type { Load } from "@/types/load";
import type { MaintenanceService } from "@/types/maintenance";
import { underLoadDaySet } from "./underLoad";

// Fleet-tab metrics: what a single owner-operator's rig has cost in the shop, and
// the day-by-day rhythm of how it ran. Pure — the clock comes in as `now`.

const DAY = 86_400_000;
const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

// ---- SHOP SPEND ---- (maintenance $ by month over a window, + recent services)
export interface ShopMonth {
  month: string; // 'YYYY-MM'
  label: string; // short month, e.g. "Jul"
  spend: number;
}
export interface ShopService {
  date: string; // 'YYYY-MM-DD'
  description: string;
  cost: number;
  unit: string; // tractor / trailer / both
}
export interface ShopSpend {
  months: ShopMonth[]; // the window, oldest → newest
  total: number;
  serviceCount: number;
  recent: ShopService[]; // most recent first
}

export const shopSpend = (
  services: MaintenanceService[],
  now: Date,
  months = 12,
): ShopSpend => {
  const buckets: ShopMonth[] = [];
  const idx = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const month = d.toISOString().slice(0, 7);
    idx.set(month, buckets.length);
    buckets.push({
      month,
      label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      spend: 0,
    });
  }
  const startMonth = buckets[0].month;

  let total = 0;
  let serviceCount = 0;
  const inWindow: MaintenanceService[] = [];
  for (const s of services) {
    const month = (s.service_date ?? "").slice(0, 7);
    if (month < startMonth) continue;
    const i = idx.get(month);
    if (i == null) continue; // future-dated / malformed — skip
    const cost = Number(s.cost) || 0;
    buckets[i].spend += cost;
    total += cost;
    serviceCount++;
    inWindow.push(s);
  }

  const recent = [...inWindow]
    .sort((a, b) => (a.service_date < b.service_date ? 1 : -1))
    .slice(0, 4)
    .map((s) => ({
      date: s.service_date,
      description: s.description,
      cost: Number(s.cost) || 0,
      unit: s.unit,
    }));

  return { months: buckets, total, serviceCount, recent };
};

// ---- THE YEAR IN DAYS ---- (per-day status for the utilization heatmap)
export type DayStatus = "underload" | "home" | "idle";

// One entry per day for the last `weeks` weeks, oldest → newest. under-load wins
// over home (you were working), home wins over idle (chosen time off vs. no
// freight) — the same honest hierarchy utilization uses.
export const fleetHeatmap = (
  loads: Load[],
  homeDays: string[],
  now: Date,
  weeks = 26,
): DayStatus[] => {
  const total = weeks * 7;
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end.getTime() - (total - 1) * DAY);
  const under = underLoadDaySet(loads, dayKey(start), dayKey(end));
  const home = new Set(homeDays);

  const out: DayStatus[] = [];
  const cur = new Date(start);
  for (let i = 0; i < total; i++) {
    const k = dayKey(cur);
    out.push(under.has(k) ? "underload" : home.has(k) ? "home" : "idle");
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
};
