import type { Load } from "@/types/load";
import type { MaintenanceService } from "@/types/maintenance";
import { underLoadDaySet } from "./underLoad";
import { dayKey as localDayKey } from "@/lib/perDiem";

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

// Which bucket a single day falls in. The per-diem calendar's default is HOME —
// an unmarked day means you were home — so home = explicit "home" mark OR
// unmarked, as long as you weren't under a load. "full"/"half" (travel) days you
// weren't loaded are idle (out, not earning). A load span you didn't override
// with a home mark is under-load.
export const dayStatus = (
  k: string,
  under: Set<string>,
  home: Set<string>,
  travel: Set<string>,
): DayStatus =>
  home.has(k) ? "home" : under.has(k) ? "underload" : travel.has(k) ? "idle" : "home";

// The most recent day you were home (scanning back from today) — home includes
// unmarked days, so this is the true "last home," not just the last explicit mark.
export const lastHomeDay = (
  loads: Load[],
  homeDays: string[],
  travelDays: string[],
  now: Date,
): string | null => {
  // Anchor "today" to the operator's LOCAL calendar day. Per-diem marks are local
  // days, and hometimeStatus measures against the local today — if we used the UTC
  // date, a US evening (UTC already "tomorrow") is an unmarked day that reads as
  // home and falsely resets the counter to "home today."
  const todayKey = localDayKey(now);
  const under = underLoadDaySet(loads, null, todayKey);
  const home = new Set(homeDays);
  const travel = new Set(travelDays);
  const cur = new Date(`${todayKey}T00:00:00Z`); // UTC-midnight of the local day, to step cleanly
  for (let i = 0; i < 400; i++) {
    const k = dayKey(cur);
    if (dayStatus(k, under, home, travel) === "home") return k;
    cur.setUTCDate(cur.getUTCDate() - 1);
  }
  return null;
};

// A GitHub-style calendar: columns are weeks (aligned to Sunday so rows are real
// weekdays), oldest on the left, this week on the right. See dayStatus for the
// under-load / home / idle rules; future days render blank.
export const fleetHeatmap = (
  loads: Load[],
  homeDays: string[],
  travelDays: string[],
  now: Date,
  weeks = 26,
): Heatmap => {
  // Local calendar "today" (see lastHomeDay) so the week boundary and the "future"
  // cutoff track the operator's day, not UTC's — otherwise a US evening renders
  // tomorrow as a real (home) cell instead of blank.
  const today = new Date(`${localDayKey(now)}T00:00:00Z`);
  const thisWeekSunday = new Date(today.getTime() - today.getUTCDay() * DAY);
  const start = new Date(thisWeekSunday.getTime() - (weeks - 1) * 7 * DAY);
  const todayKey = dayKey(today);
  const under = underLoadDaySet(loads, dayKey(start), todayKey);
  const home = new Set(homeDays);
  const travel = new Set(travelDays);

  const cells: HeatCell[] = [];
  const months: { col: number; label: string }[] = [];
  const cur = new Date(start);
  let lastMonth = -1;
  for (let i = 0; i < weeks * 7; i++) {
    const k = dayKey(cur);
    const future = k > todayKey;
    const status: DayStatus = future ? "idle" : dayStatus(k, under, home, travel);
    cells.push({ date: k, status, future });
    if (i % 7 === 0 && cur.getUTCMonth() !== lastMonth) {
      months.push({ col: i / 7, label: cur.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) });
      lastMonth = cur.getUTCMonth();
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return { cells, weeks, months };
};
