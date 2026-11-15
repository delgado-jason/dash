import { describe, it, expect } from "vitest";
import type { MaintenanceItem, MaintenanceService } from "@/types/maintenance";
import type { ExpensePeriod } from "@/types/expense";
import type { Trip } from "@/types/trip";
import type { AccountRow, SnapshotRow } from "@/services/planService";
import type { Due } from "./maintenance";
import {
  lastVisitByItem,
  dueWithin,
  booksVsLog,
  shopDays,
  maintenanceBucket,
  baselineAssumed,
  meterPrompt,
} from "./maintenanceMoney";

const NOW = new Date("2026-11-15T15:00:00Z"); // 9am Central

const item = (over: Partial<MaintenanceItem>): MaintenanceItem => ({
  item_id: "i",
  unit: "tractor",
  name: "Engine oil + filter",
  category: "engine",
  interval_miles: 15000,
  interval_months: 2,
  interval_hours: null,
  last_done_miles: 594801,
  last_done_hours: null,
  last_done_date: "2026-08-21",
  warn_lead_days: 14,
  truck_id: null,
  trailer_id: null,
  active: true,
  notes: null,
  ...over,
});

const service = (over: Partial<MaintenanceService>): MaintenanceService => ({
  service_id: "s",
  unit: "both",
  service_date: "2026-08-21",
  odometer: 594801,
  trailer_hub: 594801,
  apu_hours: null,
  vendor: "TA Petro",
  location: "Preston, AR",
  description: "Full PM",
  cost: 840.87,
  invoice_number: null,
  notes: null,
  item_ids: [],
  ...over,
});

const due = (over: Partial<Due>): Due => ({
  level: "ok",
  dueMiles: null,
  milesRemaining: null,
  dueHours: null,
  hoursRemaining: null,
  dueDate: null,
  daysRemaining: null,
  progress: null,
  etaDate: null,
  decidedBy: null,
  etaEstimated: false,
  ...over,
});

// Jason's own August: one PM that reset six clocks, one repair visit that
// reset five, a wash that reset one.
const PM = service({ service_id: "pm", service_date: "2026-08-21", cost: 840.87, item_ids: ["oil", "fuel", "lube", "cabin", "def", "tlube"] });
const RAYS = service({ service_id: "rays", service_date: "2026-08-28", vendor: "Ray's Tire Service", cost: 1562.13, item_ids: ["brakes", "seals", "transl", "transf", "tbrakes"] });
const WASH = service({ service_id: "wash", service_date: "2026-10-07", vendor: "Blue Beacon", cost: 108.2, item_ids: ["wash"] });
const OLDER_PM = service({ service_id: "old", service_date: "2026-07-02", vendor: "TA", cost: 431.73, item_ids: ["oil", "fuel", "lube"] });

describe("lastVisitByItem", () => {
  it("keeps the newest visit per clock, with the visit's own total and clock count", () => {
    const last = lastVisitByItem([WASH, RAYS, PM, OLDER_PM]);
    expect(last.get("oil")).toMatchObject({ service_id: "pm", day: "2026-08-21", cost: 840.87, clocks: 6 });
    expect(last.get("brakes")).toMatchObject({ service_id: "rays", clocks: 5 });
    expect(last.get("never")).toBeUndefined();
  });

  it("is order-independent: an older visit listed first does not win", () => {
    expect(lastVisitByItem([OLDER_PM, PM]).get("oil")?.service_id).toBe("pm");
    expect(lastVisitByItem([PM, OLDER_PM]).get("oil")?.service_id).toBe("pm");
  });
});

describe("dueWithin — the next 90 days as the visits that last did the work", () => {
  const last = lastVisitByItem([WASH, RAYS, PM]);
  const rows = [
    { item: item({ item_id: "oil" }), due: due({ level: "overdue" }) },
    { item: item({ item_id: "fuel" }), due: due({ level: "overdue" }) },
    { item: item({ item_id: "wash" }), due: due({ level: "overdue" }) },
    { item: item({ item_id: "brakes" }), due: due({ level: "ok", etaDate: "2026-12-15" }) },
    { item: item({ item_id: "cabin" }), due: due({ level: "ok", etaDate: "2027-08-21" }) }, // outside
    { item: item({ item_id: "dpf" }), due: due({ level: "unknown" }) }, // cannot count
    { item: item({ item_id: "retired", active: false }), due: due({ level: "overdue" }) },
  ];

  it("counts the clocks inside the horizon and prices their visits once each", () => {
    const n = dueWithin(rows, last, NOW, 90);
    expect(n.clocks).toBe(4); // oil, fuel, wash, brakes — not cabin, not the unknown, not the retired
    expect(n.visits.map((v) => v.service_id)).toEqual(["wash", "rays", "pm"]); // newest first, PM once for two clocks
    expect(n.total).toBeCloseTo(840.87 + 1562.13 + 108.2, 2);
    expect(n.unpriced).toBe(0);
  });

  it("a clock never done counts as a clock but adds nothing — and says so", () => {
    const n = dueWithin([{ item: item({ item_id: "new" }), due: due({ level: "overdue" }) }], last, NOW);
    expect(n).toMatchObject({ clocks: 1, total: 0, unpriced: 1, visits: [] });
  });

  it("a visit logged without a price is unpriced, not $0", () => {
    const free = lastVisitByItem([service({ service_id: "free", cost: null, item_ids: ["oil"] })]);
    const n = dueWithin([{ item: item({ item_id: "oil" }), due: due({ level: "overdue" }) }], free, NOW);
    expect(n.unpriced).toBe(1);
    expect(n.visits).toEqual([]);
  });

  it("the horizon is in the operator's own days", () => {
    const edge = [{ item: item({ item_id: "e" }), due: due({ etaDate: "2027-02-13" }) }]; // 90 days from Nov 15
    expect(dueWithin(edge, last, NOW, 90).clocks).toBe(1);
    expect(dueWithin([{ item: item({ item_id: "e" }), due: due({ etaDate: "2027-02-14" }) }], last, NOW, 90).clocks).toBe(0);
  });
});

describe("booksVsLog — the P&L's repairs line beside the log, month by month", () => {
  const period = (month: string, repairs: number | null): ExpensePeriod => ({
    period_id: month,
    period_month: `${month}-01`,
    period_label: null,
    income_total: 1,
    cogs_total: 1,
    expense_total: 1,
    repairs_total: repairs,
  });
  const periods = [
    period("2026-04", 1528.06),
    period("2026-06", 4990.05),
    period("2026-07", 431.73),
    period("2026-09", 1829.86),
    period("2026-10", 1424.71),
    period("2026-11", null), // filed, no repairs line
    period("2025-12", 999), // another year
  ];
  const log = [
    service({ service_id: "a", service_date: "2026-04-17", cost: 433.64 }),
    service({ service_id: "b", service_date: "2026-04-23", cost: 1023.53 }),
    service({ service_id: "c", service_date: "2026-07-02", cost: 431.73 }),
    service({ service_id: "d", service_date: "2026-07-28", cost: 160 }),
    service({ service_id: "e", service_date: "2026-09-03", cost: 1358.7 }),
    service({ service_id: "f", service_date: "2026-09-13", cost: 471.16 }),
    service({ service_id: "g", service_date: "2026-09-13", cost: null }), // the meter reading
    service({ service_id: "h", service_date: "2026-10-30", cost: 4710.2 }),
    service({ service_id: "i", service_date: "2026-10-07", cost: 108.2 }),
  ];

  it("names each month in words, and never calls an unfiled month a match", () => {
    const b = booksVsLog(periods, log, 2026, NOW);
    const by = Object.fromEntries(b.rows.map((r) => [r.month, r]));
    expect(b.rows).toHaveLength(11); // Jan through the current month
    expect(by["2026-03"]).toMatchObject({ books: null, logged: null, says: "no P&L filed" });
    expect(by["2026-06"]).toMatchObject({ books: 4990.05, logged: null, says: "nothing logged" });
    expect(by["2026-04"].says).toBe("matches"); // 1,457.17 against 1,528.06 — inside $150
    expect(by["2026-07"].says).toBe("more logged than filed"); // 591.73 against 431.73
    expect(by["2026-09"].says).toBe("exact");
    expect(by["2026-10"].says).toBe("more logged than filed");
    expect(by["2026-11"]).toMatchObject({ books: 0, logged: null, says: "matches" });
  });

  it("totals the books over the filed months and the log over every month, ignoring other years", () => {
    const b = booksVsLog(periods, log, 2026, NOW);
    expect(b.filedMonths).toBe(6);
    expect(b.books).toBeCloseTo(1528.06 + 4990.05 + 431.73 + 1829.86 + 1424.71, 2);
    expect(b.logged).toBeCloseTo(433.64 + 1023.53 + 431.73 + 160 + 1358.7 + 471.16 + 4710.2 + 108.2, 2);
  });

  it("a gap under $150 or 10% matches; a bigger one is named by its direction", () => {
    const b = booksVsLog([period("2026-01", 2495.05)], [service({ service_date: "2026-01-16", cost: 825.42 })], 2026, NOW);
    expect(b.rows[0].says).toBe("something unlogged");
    const c = booksVsLog([period("2026-01", 3000)], [service({ service_date: "2026-01-16", cost: 2800 })], 2026, NOW);
    expect(c.rows[0].says).toBe("matches"); // $200 is under 10% of $3,000
  });
});

describe("shopDays", () => {
  const trip = (day: string, purpose: Trip["trip_purpose"], status: Trip["status"] = "completed"): Trip =>
    ({ trip_id: day + purpose, trip_date: day, trip_purpose: purpose, status }) as Trip;
  it("counts the calendar days the truck went to the shop this year, costed at the target day", () => {
    const s = shopDays(
      [trip("2026-07-28", "shop"), trip("2026-08-21", "shop"), trip("2026-08-21", "shop"), trip("2026-10-19", "shop"), trip("2026-09-01", "home"), trip("2025-12-01", "shop"), trip("2026-11-01", "shop", "cancelled")],
      2026,
      1186,
    );
    expect(s.days).toBe(3);
    expect(s.dates).toEqual(["2026-07-28", "2026-08-21", "2026-10-19"]);
    expect(s.cost).toBe(3 * 1186);
  });
  it("has no cost without a target day", () => {
    expect(shopDays([trip("2026-07-28", "shop")], 2026, null).cost).toBeNull();
  });
});

describe("maintenanceBucket", () => {
  const accounts: AccountRow[] = [
    { account_id: "ops", name: "Ops", role: "ops", position: 1, active: true },
    { account_id: "mx", name: "Maintenance", role: "maintenance", position: 2, active: true },
  ];
  const snap = (as_of: string, created_at: string, balances: SnapshotRow["balances"]): SnapshotRow =>
    ({ snapshot_id: as_of + created_at, as_of, created_at, note: null, miles: null, pay_week_start: null, settles_month: null, balances }) as SnapshotRow;

  it("reads the Maintenance account off the latest snapshot, by day then by the clock", () => {
    const b = maintenanceBucket(accounts, [
      snap("2026-11-13", "2026-11-13T10:00:00Z", [{ account_id: "mx", balance: "4057" }]),
      snap("2026-11-05", "2026-11-05T14:00:00Z", [{ account_id: "mx", balance: 3288 }]),
      snap("2026-11-13", "2026-11-13T09:00:00Z", [{ account_id: "mx", balance: 4000 }]),
    ]);
    expect(b).toEqual({ balance: 4057, asOf: "2026-11-13" });
  });

  it("is null with no maintenance account, or no snapshot that carries it", () => {
    expect(maintenanceBucket([accounts[0]], [])).toBeNull();
    expect(maintenanceBucket(accounts, [snap("2026-11-13", "x", [{ account_id: "ops", balance: 1 }])])).toBeNull();
  });
});

describe("baselineAssumed", () => {
  const last = lastVisitByItem([PM]);
  it("is true for a clock set at in-service that no service has completed", () => {
    expect(baselineAssumed(item({ item_id: "dpf", last_done_date: "2025-06-11" }), "2025-06-11", last)).toBe(true);
    expect(baselineAssumed(item({ item_id: "oil", last_done_date: "2025-06-11" }), "2025-06-11", last)).toBe(false); // the PM did it
    expect(baselineAssumed(item({ item_id: "dpf", last_done_date: "2026-01-01" }), "2025-06-11", last)).toBe(false);
    expect(baselineAssumed(item({ item_id: "dpf", last_done_date: "2025-06-11" }), null, last)).toBe(false);
  });
});

describe("meterPrompt", () => {
  const apu = { hours: 13755, estimated: true, readOn: "2026-10-07", rate: 13, source: "projection" as const };
  it("asks for a reading when there is none, when the projection is stale, or when a projected clock is close", () => {
    expect(meterPrompt({ ...apu, hours: null }, null, [])).toMatch(/no reading on file/);
    expect(meterPrompt(apu, 39, [])).toBe("read the meter — the projection is 39 road days old");
    expect(meterPrompt(apu, 10, [{ item: item({ unit: "apu" }), due: due({ level: "soon" }) }])).toMatch(/read the meter at the next stop/);
    expect(meterPrompt(apu, 10, [{ item: item({ unit: "apu" }), due: due({ level: "ok" }) }])).toBeNull();
    expect(meterPrompt({ ...apu, estimated: false }, 0, [{ item: item({ unit: "apu" }), due: due({ level: "overdue" }) }])).toBeNull();
  });
});
