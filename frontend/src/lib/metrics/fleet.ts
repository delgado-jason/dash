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

// ---- THE YEAR IN DAYS ---- (calendar heatmap of how the truck ran)
export type DayStatus = "underload" | "home" | "idle";
export interface HeatCell {
  date: string; // 'YYYY-MM-DD'
  status: DayStatus;
  future: boolean; // after today — rendered blank
}
export interface Heatmap {
  cells: HeatCell[]; // 7 × weeks, column-major: each column is a week, row = weekday (Sun→Sat)
  weeks: number;
  months: { col: number; label: string }[]; // a label at the column where each month begins
}

// A GitHub-style calendar: columns are weeks (aligned to Sunday so rows are real
// weekdays), oldest on the left, this week on the right. A "home" mark WINS over
// a load's pickup→delivery envelope — if you said you were home, you weren't
// hauling — then under-load, then idle.
export const fleetHeatmap = (
  loads: Load[],
  homeDays: string[],
  now: Date,
  weeks = 26,
): Heatmap => {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const thisWeekSunday = new Date(today.getTime() - today.getUTCDay() * DAY);
  const start = new Date(thisWeekSunday.getTime() - (weeks - 1) * 7 * DAY);
  const todayKey = dayKey(today);
  const under = underLoadDaySet(loads, dayKey(start), todayKey);
  const home = new Set(homeDays);

  const cells: HeatCell[] = [];
  const months: { col: number; label: string }[] = [];
  const cur = new Date(start);
  let lastMonth = -1;
  for (let i = 0; i < weeks * 7; i++) {
    const k = dayKey(cur);
    const future = k > todayKey;
    const status: DayStatus = future
      ? "idle"
      : home.has(k) ? "home" : under.has(k) ? "underload" : "idle";
    cells.push({ date: k, status, future });
    if (i % 7 === 0 && cur.getUTCMonth() !== lastMonth) {
      months.push({ col: i / 7, label: cur.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) });
      lastMonth = cur.getUTCMonth();
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return { cells, weeks, months };
};
