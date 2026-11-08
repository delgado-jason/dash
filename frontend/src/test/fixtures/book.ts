// THE SYNTHETIC BOOK — one deterministic six-month ledger of a one-truck
// flatbed business (May–Oct 2026), the single input every contract test runs
// on. Nothing here is copied from production: load numbers start at 9100001,
// agents are 'Agent A'…'Agent E', no contact details of any kind.
//
// Shape of the year (so a contract can lean on it):
//  · TODAY is Wednesday 2026-11-04. Pay weeks run Wednesday → Tuesday; the
//    current one is Nov 4–10.
//  · 32 delivered loads, May 1 → Nov 3, chained odometers from 500,000 the way
//    the owner logs them: each load's start copies the previous load's end, so
//    the empty run sits INSIDE the next load's window. Exactly one pickup
//    carries a fresh reading — the one after the logged home trip (Aug 11).
//  · Plus one booked and one in_transit load whose PLANNED delivery is in the
//    past (expected, never delivered), one TONU, one cancelled.
//  · Six filed P&L months (May–Oct); `brokenPeriod` seeds an unfiled one.
//  · Statements: one per pay week that delivered, period_ending a Wednesday,
//    plus one negative-net statement for the home week. The statement for the
//    last delivery (Tue Nov 3, → Wed Nov 4) is not in the vault yet.
//  · Net and gross revenue are filled the way the backend does (NET-01/02).
//
// Every call returns a FRESH object graph — mutate it freely in a test.
import type { PerDiemRate } from "@/types/perDiemRate";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import type { ExpensePeriod, ExpenseLine, ExpenseType, ExpenseSection } from "@/types/expense";
import type { Obligation } from "@/types/obligation";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import type { SettlementSplit } from "@/types/settlementSplit";
import type { AccessorialRate } from "@/types/accessorialRate";
import type { Accessorial } from "@/types/accessorial";
import type { SettlementSummary, SettlementLine } from "@/types/settlement";
import type { FuelEntry } from "@/types/fuelEntry";
import type { PlanRow, AccountRow, SnapshotRow, OpsCheckRow } from "@/services/planService";
import type { CashAssumptionsRow, MonthlyFinancialRow } from "@/services/cashflowService";
import { collectReadings, weekOdometerMiles } from "@/lib/metrics/odometer";
import { payWeekOf } from "@/lib/metrics/payWeeks";

export const TODAY = "2026-11-04";

// A statement line, tied back to its statement and (for a load's own line)
// its load number so a contract can group by either.
export type BookSettlementLine = SettlementLine & { settlement_id: string; load_number: string | null };

export type Book = {
  loads: Load[];
  trips: Trip[];
  periods: ExpensePeriod[];
  obligations: Obligation[];
  schedule: SettlementSchedule;
  splits: SettlementSplit[]; // the dated pay splits (NET-01) — one row, in force for every load
  perDiemRates: PerDiemRate[];
  payRates: AccessorialRate[];
  settlements: SettlementSummary[];
  settlementLines: BookSettlementLine[];
  fuel: FuelEntry[];
  snapshots: SnapshotRow[];
  accounts: AccountRow[];
  plan: PlanRow;
  assumptions: CashAssumptionsRow;
  opsChecks: OpsCheckRow[];
  // Not in the spec's field list, added because a load carries only the SUM of
  // its accessorials: the per-type rows the net-revenue rule and the integrity
  // checks read live here.
  accessorials: Accessorial[];
  // The pasted QuickBooks archive, May–Oct: each month's expenses equal the
  // filed P&L's cogs + expense totals (within a cent) and the cash chain is
  // continuous (each month opens where the last closed).
  financials: MonthlyFinancialRow[];
};

// ---------------------------------------------------------------- helpers

const round2 = (n: number): number => Math.round(n * 100) / 100;
const fixed = (n: number): string => n.toFixed(2);
const utc = (k: string): Date => new Date(`${k}T00:00:00Z`);
const addDays = (k: string, n: number): string => {
  const d = utc(k);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string): number => Math.round((utc(b).getTime() - utc(a).getTime()) / 86400000);
// The first Wednesday strictly after a day — the statement a delivery lands on.
const statementAfter = (k: string): string => {
  let d = addDays(k, 1);
  while (utc(d).getUTCDay() !== 3) d = addDays(d, 1);
  return d;
};
const monthKey = (k: string): string => k.slice(0, 7);
const stamp = (k: string, hhmm = "12:00"): string => `${k}T${hhmm}:00.000Z`;

// ---------------------------------------------------------------- the cast

const CITIES = {
  HOU: ["Houston", "TX"],
  DAL: ["Dallas", "TX"],
  BHM: ["Birmingham", "AL"],
  ATL: ["Atlanta", "GA"],
  BNA: ["Nashville", "TN"],
  MEM: ["Memphis", "TN"],
  MOB: ["Mobile", "AL"],
  JAN: ["Jackson", "MS"],
  BTR: ["Baton Rouge", "LA"],
} as const;
type CityKey = keyof typeof CITIES;

const AGENTS = [
  { id: "agent-a", name: "Agent A", code: "AGA" },
  { id: "agent-b", name: "Agent B", code: "AGB" },
  { id: "agent-c", name: "Agent C", code: "AGC" },
  { id: "agent-d", name: "Agent D", code: "AGD" },
  { id: "agent-e", name: "Agent E", code: "AGE" },
] as const;

const AGENCY = { id: "agency-nrt", name: "Agency North (NRT)", code: "NRT" };

// ---------------------------------------------------------------- the loads

type Spec = {
  pu: string;
  del: string;
  from: CityKey;
  to: CityKey;
  loaded: number;
  empty: number; // the empty run to this pickup — it sits inside this load's odometer window
  lh: number; // linehaul, whole dollars
  fsc: number;
  acc: readonly (readonly [string, number])[];
  agent: 0 | 1 | 2 | 3 | 4;
  type?: string;
};

const DELIVERED: readonly Spec[] = [
  { pu: "2026-04-29", del: "2026-05-01", from: "HOU", to: "BHM", loaded: 650, empty: 25, lh: 3250, fsc: 390, acc: [["Tarp", 150]], agent: 0 },
  { pu: "2026-05-04", del: "2026-05-06", from: "ATL", to: "HOU", loaded: 790, empty: 150, lh: 3900, fsc: 470, acc: [], agent: 1 },
  { pu: "2026-05-08", del: "2026-05-11", from: "HOU", to: "JAN", loaded: 400, empty: 15, lh: 2550, fsc: 270, acc: [["Tarp", 150], ["Job-Site Delivery", 175]], agent: 2 },
  { pu: "2026-05-13", del: "2026-05-14", from: "JAN", to: "BNA", loaded: 440, empty: 10, lh: 2750, fsc: 300, acc: [], agent: 0 },
  { pu: "2026-05-18", del: "2026-05-19", from: "BNA", to: "DAL", loaded: 665, empty: 20, lh: 3600, fsc: 430, acc: [["Hazmat", 300]], agent: 3, type: "hazmat" },
  { pu: "2026-05-26", del: "2026-05-28", from: "DAL", to: "ATL", loaded: 780, empty: 10, lh: 4100, fsc: 500, acc: [["Tarp", 150]], agent: 1 },
  { pu: "2026-06-01", del: "2026-06-03", from: "ATL", to: "BTR", loaded: 650, empty: 12, lh: 3050, fsc: 360, acc: [["Tarp", 150]], agent: 4 },
  { pu: "2026-06-05", del: "2026-06-08", from: "BTR", to: "MEM", loaded: 390, empty: 8, lh: 2500, fsc: 260, acc: [], agent: 0 },
  { pu: "2026-06-10", del: "2026-06-12", from: "MEM", to: "HOU", loaded: 560, empty: 14, lh: 3300, fsc: 400, acc: [["High Value-EVC", 200]], agent: 2 },
  { pu: "2026-06-16", del: "2026-06-18", from: "HOU", to: "BHM", loaded: 650, empty: 20, lh: 3500, fsc: 410, acc: [["Hazmat", 300], ["Tarp", 150]], agent: 3, type: "hazmat" },
  { pu: "2026-06-22", del: "2026-06-25", from: "BHM", to: "DAL", loaded: 640, empty: 18, lh: 3450, fsc: 400, acc: [], agent: 1 },
  { pu: "2026-07-01", del: "2026-07-03", from: "DAL", to: "MOB", loaded: 790, empty: 12, lh: 4300, fsc: 520, acc: [["Tarp", 150]], agent: 0 },
  { pu: "2026-07-07", del: "2026-07-09", from: "MOB", to: "BNA", loaded: 560, empty: 16, lh: 3200, fsc: 380, acc: [], agent: 4 },
  { pu: "2026-07-12", del: "2026-07-14", from: "BNA", to: "HOU", loaded: 780, empty: 22, lh: 4200, fsc: 500, acc: [["Job-Site Delivery", 250]], agent: 2, type: "oversize" },
  { pu: "2026-07-20", del: "2026-07-23", from: "HOU", to: "ATL", loaded: 800, empty: 10, lh: 4000, fsc: 480, acc: [["Tarp", 150]], agent: 1 },
  { pu: "2026-07-27", del: "2026-07-30", from: "ATL", to: "BTR", loaded: 650, empty: 12, lh: 3100, fsc: 370, acc: [], agent: 3 },
  { pu: "2026-08-03", del: "2026-08-04", from: "BTR", to: "DAL", loaded: 430, empty: 9, lh: 2600, fsc: 280, acc: [["Tarp", 150]], agent: 0 },
  { pu: "2026-08-06", del: "2026-08-10", from: "DAL", to: "MEM", loaded: 450, empty: 11, lh: 2700, fsc: 300, acc: [], agent: 4 },
  // — home trip Aug 11 (see TRIP below); the next pickup carries a fresh reading —
  { pu: "2026-08-19", del: "2026-08-21", from: "HOU", to: "BHM", loaded: 650, empty: 20, lh: 3400, fsc: 400, acc: [["Tarp", 150]], agent: 1 },
  { pu: "2026-08-24", del: "2026-08-27", from: "BHM", to: "DAL", loaded: 640, empty: 15, lh: 3500, fsc: 410, acc: [["Hazmat", 300]], agent: 3, type: "hazmat" },
  { pu: "2026-08-30", del: "2026-09-01", from: "DAL", to: "ATL", loaded: 780, empty: 10, lh: 4050, fsc: 500, acc: [["Tarp", 150]], agent: 0 },
  { pu: "2026-09-04", del: "2026-09-08", from: "ATL", to: "MEM", loaded: 380, empty: 12, lh: 2800, fsc: 270, acc: [], agent: 2 },
  { pu: "2026-09-10", del: "2026-09-11", from: "MEM", to: "HOU", loaded: 560, empty: 14, lh: 3300, fsc: 400, acc: [["High Value-EVC", 250]], agent: 4 },
  { pu: "2026-09-15", del: "2026-09-17", from: "HOU", to: "BNA", loaded: 780, empty: 12, lh: 4150, fsc: 500, acc: [["Job-Site Delivery", 200]], agent: 1 },
  { pu: "2026-09-21", del: "2026-09-24", from: "BNA", to: "BTR", loaded: 650, empty: 18, lh: 3300, fsc: 390, acc: [], agent: 0 },
  { pu: "2026-09-28", del: "2026-09-29", from: "BTR", to: "ATL", loaded: 650, empty: 10, lh: 3200, fsc: 380, acc: [["Tarp", 150]], agent: 2 },
  { pu: "2026-10-02", del: "2026-10-05", from: "ATL", to: "HOU", loaded: 790, empty: 15, lh: 4000, fsc: 480, acc: [], agent: 3 },
  { pu: "2026-10-08", del: "2026-10-09", from: "HOU", to: "MOB", loaded: 560, empty: 14, lh: 3000, fsc: 350, acc: [["Tarp", 150]], agent: 4 },
  { pu: "2026-10-13", del: "2026-10-15", from: "MOB", to: "DAL", loaded: 790, empty: 16, lh: 4200, fsc: 510, acc: [["Hazmat", 300]], agent: 1, type: "hazmat" },
  { pu: "2026-10-19", del: "2026-10-20", from: "DAL", to: "BHM", loaded: 640, empty: 12, lh: 3500, fsc: 420, acc: [], agent: 0 },
  { pu: "2026-10-23", del: "2026-10-27", from: "BHM", to: "HOU", loaded: 650, empty: 20, lh: 3300, fsc: 400, acc: [["Tarp", 150]], agent: 2 },
  { pu: "2026-10-30", del: "2026-11-03", from: "HOU", to: "ATL", loaded: 800, empty: 10, lh: 4150, fsc: 500, acc: [], agent: 3 },
];
// The load after which the owner ran home (index into DELIVERED).
const HOME_AFTER = 17;
const HOME_TRIP = { date: "2026-08-11", miles: 565 };

const SCHEDULE: Readonly<Pick<SettlementSplit, "linehaul_pct" | "trailer_pct" | "fuel_surcharge_pct" | "accessorial_pct">> = {
  linehaul_pct: 0.65,
  trailer_pct: 0.08,
  fuel_surcharge_pct: 1,
  accessorial_pct: 0.73,
};
// Job-Site Delivery deliberately has NO row: it takes the accessorial_pct fallback.
const PAY_RATES: readonly AccessorialRate[] = [
  { accessorial_type: "Tarp", pay_pct: 1, pass_through: false },
  { accessorial_type: "Hazmat", pay_pct: 0.73, pass_through: false },
  { accessorial_type: "High Value-EVC", pay_pct: 0, pass_through: false },
];

// NET-01 in whole cents (every input is whole dollars, so this is exact):
// linehaul × (linehaul% + trailer%) + FSC × FSC% + Σ accessorial × its rate or
// the fallback; the trailer's slice is trailer% of linehaul + trailer% of the
// accessorials kept at the linehaul take.
const pctOf = (type: string): number => {
  const row = PAY_RATES.find((r) => r.accessorial_type === type);
  return Math.round((row ? row.pay_pct : SCHEDULE.accessorial_pct) * 100);
};
const money = (s: Pick<Spec, "lh" | "fsc" | "acc">) => {
  const takeCents = Math.round((SCHEDULE.linehaul_pct + SCHEDULE.trailer_pct) * 100);
  let netCents = s.lh * takeCents + s.fsc * Math.round(SCHEDULE.fuel_surcharge_pct * 100);
  let trailerCents = s.lh * Math.round(SCHEDULE.trailer_pct * 100);
  let accTotal = 0;
  for (const [type, amount] of s.acc) {
    accTotal += amount;
    netCents += amount * pctOf(type);
    if (pctOf(type) === takeCents) trailerCents += Math.round((amount * pctOf(type) * SCHEDULE.trailer_pct * 100) / 100);
  }
  return {
    acc: accTotal,
    gross: s.lh + s.fsc + accTotal,
    net: netCents / 100,
    trailer: trailerCents / 100,
  };
};

type Chained = Spec & { start: number; end: number; number: string };

// The odometer chain: start copies the previous end; one fresh reading after
// the home trip. Returns the delivered loads, the trip's own window, and the
// chain's windows (for placing fuel fills on the calendar).
const chainLoads = () => {
  let odo = 500000;
  const out: Chained[] = [];
  let tripWindow: { start: number; end: number } | null = null;
  DELIVERED.forEach((s, i) => {
    if (i === HOME_AFTER + 1) {
      tripWindow = { start: odo, end: odo + HOME_TRIP.miles };
      odo = tripWindow.end; // the fresh reading: > the previous load's end
    }
    const start = odo;
    const end = start + s.loaded + s.empty;
    out.push({ ...s, start, end, number: String(9100001 + i) });
    odo = end;
  });
  return { loads: out, tripWindow: tripWindow as unknown as { start: number; end: number } };
};

// ---------------------------------------------------------------- the build

export const syntheticBook = (): Book => {
  const { loads: chained, tripWindow } = chainLoads();

  const mkLoad = (
    s: Spec,
    number: string,
    status: string,
    over: Partial<Load> = {},
  ): Load => {
    const m = money(s);
    const agent = AGENTS[s.agent];
    const [oc, os] = CITIES[s.from];
    const [dc, ds] = CITIES[s.to];
    return {
      load_id: `load-${number}`,
      load_number: number,
      load_type: s.type ?? "standard flatbed",
      load_status: status,
      agency_id: AGENCY.id,
      agency_code: AGENCY.code,
      posting_code: agent.code,
      agent_id: agent.id,
      booked_via: s.agent % 2 === 0 ? "agent_reached_out" : "i_reached_out",
      agent: agent.name,
      agent_email: null,
      pickup_date: s.pu,
      origin_market_id: `mkt-${oc.toLowerCase().replace(/ /g, "-")}-${os.toLowerCase()}`,
      origin_city: oc,
      origin_state: os,
      origin_market: `${oc} Market`,
      delivery_date: s.del,
      destination_market_id: `mkt-${dc.toLowerCase().replace(/ /g, "-")}-${ds.toLowerCase()}`,
      destination_city: dc,
      destination_state: ds,
      delivery_market: `${dc} Market`,
      deadhead_miles: s.empty,
      loaded_miles: s.loaded,
      linehaul: fixed(s.lh),
      fuel_surcharge: fixed(s.fsc),
      total_accessorials: fixed(m.acc),
      gross_revenue: fixed(m.gross),
      net_revenue: fixed(m.net),
      trailer_net: fixed(m.trailer),
      commodity: "Steel coils",
      weight: null,
      odometer_start: null,
      odometer_end: null,
      payment_status: "unpaid",
      customer_end: "shipper",
      truck_id: "truck-1",
      driver_id: "driver-1",
      booked_by: "user-1",
      created_at: stamp(addDays(s.pu, -2)),
      updated_at: stamp(s.del),
      ...over,
    };
  };

  // ---- loads ----
  const loads: Load[] = chained.map((c) => {
    const paid = statementAfter(c.del) < TODAY;
    return mkLoad(c, c.number, "delivered", {
      odometer_start: c.start,
      odometer_end: c.end,
      payment_status: paid ? "paid" : "unpaid",
    });
  });
  // A booking that never moved and a load that never closed — their PLANNED
  // delivery days are long past, and that is not a delivery.
  loads.push(
    mkLoad(
      { pu: "2026-10-21", del: "2026-10-22", from: "DAL", to: "BNA", loaded: 665, empty: 20, lh: 3500, fsc: 420, acc: [], agent: 4 },
      "9100033",
      "booked",
    ),
    mkLoad(
      { pu: "2026-11-01", del: "2026-11-02", from: "MEM", to: "HOU", loaded: 560, empty: 14, lh: 3300, fsc: 400, acc: [], agent: 2 },
      "9100034",
      "in_transit",
    ),
    mkLoad(
      { pu: "2026-07-17", del: "2026-07-17", from: "HOU", to: "HOU", loaded: 0, empty: 0, lh: 250, fsc: 0, acc: [], agent: 1 },
      "9100035",
      "tonu",
      { delivery_date: null, commodity: null },
    ),
    mkLoad(
      { pu: "2026-09-18", del: "2026-09-19", from: "HOU", to: "BHM", loaded: 650, empty: 20, lh: 3600, fsc: 420, acc: [], agent: 3 },
      "9100036",
      "cancelled",
    ),
  );

  // ---- accessorials (the per-type rows behind total_accessorials) ----
  const accessorials: Accessorial[] = [];
  chained.forEach((c) =>
    c.acc.forEach(([type, amount], j) =>
      accessorials.push({
        accessorial_id: `acc-${c.number}-${j + 1}`,
        load_id: `load-${c.number}`,
        accessorial_type: type,
        amount,
        created_at: stamp(c.del),
        updated_at: stamp(c.del),
      }),
    ),
  );

  // ---- the one logged home trip, between load 18 and the next pickup ----
  const trips: Trip[] = [
    {
      trip_id: "trip-1",
      trip_number: 1,
      trip_purpose: "home",
      truck_id: "truck-1",
      unit_number: "101",
      driver_id: "driver-1",
      driver_name: "Driver A",
      trip_type: "deadhead",
      trip_source: "user",
      trip_date: HOME_TRIP.date,
      status: "completed",
      odometer_start: tripWindow.start,
      odometer_end: tripWindow.end,
      is_estimated: false,
      start_city: "Memphis",
      start_state: "TN",
      end_city: "Houston",
      end_state: "TX",
      created_at: stamp(HOME_TRIP.date),
      updated_at: stamp(HOME_TRIP.date),
    },
  ];

  // ---- fuel: a full tank every ~840 miles, dated by where the chain was ----
  type Win = { s: number; e: number; d0: string; d1: string; city: [string, string]; city1: [string, string] };
  const wins: Win[] = [];
  chained.forEach((c, i) => {
    if (i === HOME_AFTER + 1) {
      wins.push({
        s: tripWindow.start,
        e: tripWindow.end,
        d0: HOME_TRIP.date,
        d1: addDays(HOME_TRIP.date, 1),
        city: ["Memphis", "TN"],
        city1: ["Houston", "TX"],
      });
    }
    wins.push({ s: c.start, e: c.end, d0: c.pu, d1: c.del, city: [...CITIES[c.from]], city1: [...CITIES[c.to]] });
  });
  const PRICES = [
    4.289, 4.312, 4.355, 4.401, 4.438, 4.472, 4.519, 4.563, 4.611, 4.668, 4.724, 4.795, 4.861, 4.932, 5.018, 5.094,
    5.162, 5.231, 5.287, 5.342, 5.318, 5.265, 5.197, 5.112, 5.034, 4.958, 4.887, 4.821, 4.766, 4.713, 4.66, 4.612,
  ];
  const MPG = [6.5, 6.7, 6.4, 6.8, 6.6, 6.3, 6.9, 6.5, 6.7, 6.4];
  const STEP = 840;
  const lastEnd = wins[wins.length - 1].e;
  const fuel: FuelEntry[] = [];
  for (let k = 1; 500000 + k * STEP <= lastEnd; k++) {
    const o = 500000 + k * STEP;
    const w = wins.find((x) => o >= x.s && o <= x.e) as Win;
    const frac = w.e > w.s ? (o - w.s) / (w.e - w.s) : 0;
    const date = addDays(w.d0, Math.round(frac * daysBetween(w.d0, w.d1)));
    const [city, state] = frac < 0.5 ? w.city : w.city1;
    const gallons = round2(STEP / MPG[(k - 1) % MPG.length]);
    fuel.push({
      fuel_entry_id: `fuel-${k}`,
      truck_id: "truck-1",
      trip_id: null,
      fuel_date: date,
      gallons,
      price_per_gallon: PRICES[(k - 1) % PRICES.length],
      odometer_reading: o,
      apu_hours: null,
      filled_to_top: true, // the book's fills are full tanks (GL-154)
      company_name: "Fuel Network A",
      fuel_city: city,
      fuel_state: state,
      created_at: stamp(date, "18:00"),
      updated_at: stamp(date, "18:00"),
    });
  }

  // ---- the six filed P&L months ----
  const MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
  const MONTH_NAMES = ["May", "June", "July", "August", "September", "October"];
  const REPAIRS = [880, 1240, 640, 1515, 720, 980];
  const TOLLS = [190, 240, 210, 170, 260, 230];
  const TIRES = [0, 0, 620, 0, 0, 0];
  const OFFICE = [45, 80, 30, 95, 60, 40];
  const INTEREST = [318.2, 316.05, 313.88, 311.69, 309.48, 307.25];
  const periods: ExpensePeriod[] = MONTHS.map((m, i) => {
    const fuelSpend = round2(
      fuel.filter((f) => monthKey(f.fuel_date) === m).reduce((s, f) => s + f.gallons * f.price_per_gallon, 0),
    );
    const monthNet = round2(
      chained.filter((c) => monthKey(c.del) === m).reduce((s, c) => s + money(c).net, 0),
    );
    const line = (category: string, amount: number, type: ExpenseType, section: ExpenseSection, j: number): ExpenseLine => ({
      line_id: `ln-${m}-${j}`,
      category,
      amount,
      type,
      section,
    });
    const lines: ExpenseLine[] = [
      line("Fuel", fuelSpend, "variable", "cogs", 1),
      line("Maintenance & Repairs", REPAIRS[i], "variable", "cogs", 2),
      line("Tolls & Scales", TOLLS[i], "variable", "cogs", 3),
      ...(TIRES[i] > 0 ? [line("Tires", TIRES[i], "variable", "cogs", 4)] : []),
      line("Payroll", 5630, "fixed", "expenses", 5),
      line("Insurance", 1350, "fixed", "expenses", 6),
      line("Interest", INTEREST[i], "fixed", "expenses", 7),
      line("Permits & Licenses", 140, "fixed", "expenses", 8),
      line("Software & Subscriptions", 160, "fixed", "expenses", 9),
      line("Phone", 120, "fixed", "expenses", 10),
      line("Accounting", 75, "fixed", "expenses", 11),
      line("Parking", 110, "fixed", "expenses", 12),
      line("Office & Supplies", OFFICE[i], "variable", "expenses", 13),
    ];
    const sum = (section: ExpenseSection): number =>
      round2(lines.filter((l) => l.section === section).reduce((s, l) => s + l.amount, 0));
    return {
      period_id: `per-${m}`,
      period_month: `${m}-01`,
      period_label: `${MONTH_NAMES[i]} 2026`,
      income_total: monthNet,
      cogs_total: sum("cogs"),
      expense_total: sum("expenses"),
      lines,
    };
  });

  // ---- the pasted QuickBooks months, consistent with the filed P&L ----
  const money2 = (n: number): string => n.toFixed(2);
  let cash = 11000;
  const financials: MonthlyFinancialRow[] = periods.map((p) => {
    const income = p.income_total ?? 0;
    const cogs = p.cogs_total ?? 0;
    // QuickBooks' total_opex carries the whole expense section, interest included;
    // interest_expense is reported beside it, not on top (prod, 2026-11-07).
    const interest = p.lines?.find((l) => l.category === "Interest")?.amount ?? 0;
    const opex = round2(p.expense_total ?? 0);
    const ni = round2(income - cogs - opex);
    const beginning = cash;
    const depreciation = 1850;
    const financing = -1200; // the truck note's principal
    const ending = round2(beginning + ni + depreciation + financing);
    cash = ending;
    return {
      month: p.period_month,
      total_income: money2(income),
      total_cogs: money2(cogs),
      total_opex: money2(opex),
      interest_expense: money2(interest),
      net_income: money2(ni),
      beginning_cash: money2(beginning),
      operating_adjustments: money2(depreciation),
      investing: "0.00",
      financing: money2(financing),
      ending_cash: money2(ending),
      accounts_receivable: "0.00",
      total_liabilities: "60000.00",
      total_equity: "20000.00",
      depreciation: money2(depreciation),
    };
  });

  // ---- obligations ----
  const obligations: Obligation[] = [
    {
      obligation_id: "obl-truck-note",
      label: "Truck Note",
      amount: 1200, // the principal portion — break-even reads this
      active: true,
      is_draw: false,
      category: "loan_lease",
      day_of_month: 26,
      draft_amount: 1575, // the full bank draft — the cash board reads this
      on_pl: false,
      original_balance: 62000,
      current_balance: 56100,
      balance_as_of: "2026-07-15",
      payoff_date: null,
      asset_type: "truck",
      asset_id: "truck-1",
    },
    {
      obligation_id: "obl-insurance",
      label: "Truck Insurance",
      amount: 1350,
      active: true,
      is_draw: false,
      category: "insurance",
      day_of_month: 4,
      draft_amount: null,
      on_pl: true, // already inside the P&L's Insurance line
      original_balance: null,
      current_balance: null,
      balance_as_of: null,
      payoff_date: null,
      asset_type: null,
      asset_id: null,
    },
    {
      obligation_id: "obl-owner-draw",
      label: "Owner Distribution",
      amount: 2000,
      active: true,
      is_draw: true, // a draw is never a cost
      category: "other",
      day_of_month: null,
      draft_amount: null,
      on_pl: false,
      original_balance: null,
      current_balance: null,
      balance_as_of: null,
      payoff_date: null,
      asset_type: null,
      asset_id: null,
    },
    {
      obligation_id: "obl-old-trailer",
      label: "Old Trailer Lease",
      amount: 300,
      active: false, // ended — excluded everywhere
      is_draw: false,
      category: "loan_lease",
      day_of_month: 27,
      draft_amount: 475,
      on_pl: false,
      original_balance: null,
      current_balance: null,
      balance_as_of: null,
      payoff_date: null,
      asset_type: "trailer",
      asset_id: "trailer-1",
    },
  ];

  // ---- the dated per-diem rates (the clean book has $80 in force on TODAY) ----
  const perDiemRates: PerDiemRate[] = [
    { rate_id: "pdr-2025", effective_from: "2025-01-01", rate: 69, note: "the rate 2025 was filed at — kept so past years never move" },
    { rate_id: "pdr-2026", effective_from: "2026-01-01", rate: 80, note: "IRS FY2026 transportation rate" },
  ];

  // ---- the settlement schedule ----
  const splits: SettlementSplit[] = [
    { split_id: "split-1", effective_from: "2026-01-01", ...SCHEDULE, note: "the book's one split — in force for every load" },
  ];
  const schedule: SettlementSchedule = {
    carrier_name: "Carrier A",
    detention_free_hours: 3,
    settlement_day: 3,
    deposit_lag_days: 1,
    per_diem_deduct_pct: 0.8,
    hometime_threshold_days: 42,
    operation: "flatbed",
    rate_tier_std_min: 0.1,
    rate_tier_std_target: 0.2,
    rate_tier_std_strong: 0.3,
    rate_tier_spec_min: 0.35,
    rate_tier_spec_target: 0.45,
    rate_tier_spec_strong: 0.6,
    margin_goal: 0.26,
  };
  const payRates: AccessorialRate[] = PAY_RATES.map((r) => ({ ...r })); // no pass-through in the book — NET-02 is tested on its own fixtures

  // ---- statements: one per pay week that delivered, plus the home week ----
  const settlements: SettlementSummary[] = [];
  const settlementLines: BookSettlementLine[] = [];
  const dates = [...new Set(chained.map((c) => statementAfter(c.del)))].filter((d) => d < TODAY);
  const HOME_STATEMENT = "2026-08-19"; // covers Aug 12–18: the truck was home, nothing delivered
  const allDates = [...dates, HOME_STATEMENT].sort();
  let ytd = 0;
  allDates.forEach((d) => {
    const sid = `stl-${d}`;
    const mine = chained.filter((c) => statementAfter(c.del) === d);
    let n = 0;
    const push = (l: Omit<BookSettlementLine, "line_id" | "period_ending" | "server_url" | "settlement_id" | "is_adjustment" | "unit">) =>
      settlementLines.push({
        ...l,
        line_id: `${sid}-${++n}`,
        settlement_id: sid,
        is_adjustment: false,
        unit: "101",
        period_ending: d,
        server_url: "",
      });
    let revenue = 0;
    let deductions = 0;
    let advances = 0;
    mine.forEach((c, idx) => {
      const net = money(c).net;
      revenue += net;
      push({
        kind: "trip",
        line_class: "linehaul",
        description: `Load ${c.number} · ${AGENTS[c.agent].name}`,
        load_number: c.number,
        revenue: net,
        refunds: null,
        deductions: null,
        net: null,
      });
      if (idx === 0) {
        // The weekly fuel advance, drawn against the week's loads.
        advances = 2000;
        deductions += 2000;
        push({
          kind: "trip",
          line_class: "advance",
          description: `Fuel advance · load ${c.number}`,
          load_number: c.number,
          revenue: null,
          refunds: null,
          deductions: 2000,
          net: null,
        });
      }
    });
    const fees: [string, number][] = [
      ["Weekly program fee", 61.75],
      ["Trailer program fee", 110.25],
    ];
    if (Number(d.slice(8, 10)) <= 7) fees.push(["Monthly insurance stack", 518]);
    if (d === HOME_STATEMENT) fees.push(["Escrow top-up", 183.4]);
    fees.forEach(([description, amount]) => {
      deductions += amount;
      push({ kind: "recurring", line_class: "fee", description, load_number: null, revenue: null, refunds: null, deductions: amount, net: null });
    });
    revenue = round2(revenue);
    deductions = round2(deductions);
    const net = round2(revenue - deductions);
    ytd = round2(ytd + net);
    settlements.push({
      settlement_id: sid,
      period_ending: d,
      revenue,
      refunds: 0,
      deductions,
      net,
      escrow_tractor: null,
      escrow_trailer: null,
      ytd_earnings: ytd,
      server_url: "",
      loads: mine.length,
      advances,
      adjustments: [],
      unmatched_loads: [],
    });
  });

  // ---- the plan and its accounts ----
  const accounts: AccountRow[] = [
    { account_id: "acct-ops", name: "Ops checking", role: "ops", position: 1, active: true },
    { account_id: "acct-maint", name: "Maintenance reserve", role: "maintenance", position: 2, active: true },
    { account_id: "acct-tax", name: "Tax reserve", role: "tax", position: 3, active: true },
    { account_id: "acct-vault", name: "Vault savings", role: "vault", position: 4, active: true },
  ];
  const plan: PlanRow = {
    plan_id: "plan-2026",
    label: "2026 plan",
    year: 2026,
    float_line: "10000",
    float_line_home_lo: null,
    float_line_home_hi: null,
    maintenance_weekly: "0",
    tax_weekly: "0",
    maintenance_per_mile: "0.32",
    tax_pct: "20",
    maintenance_floor: "5000",
    min_move: "500",
    objective_pct: "70",
    leave_weeks: 4, // migration 104 — the leave reserve horizon, weeks of a parked truck
    first_money_month: "2026-05-01",
    active: true,
    stages: [
      { stage_id: "stage-1", plan_id: "plan-2026", position: 1, label: "Vault cushion — the floor", kind: "vault", obligation_id: null, target_lo: "15000", target_hi: null },
      { stage_id: "stage-2", plan_id: "plan-2026", position: 2, label: "Truck note — pay it down", kind: "obligation", obligation_id: "obl-truck-note", target_lo: "0", target_hi: null },
      { stage_id: "stage-3", plan_id: "plan-2026", position: 3, label: "Cushion — three months of the burn", kind: "vault", obligation_id: null, target_lo: "30000", target_hi: "35000" },
    ],
  };

  // ---- Friday snapshots: May 1 → Oct 30, each accruing the pay week that
  // closed before it (the odometer chain's miles), a money day now and then ----
  const readings = collectReadings(fuel, loads, trips);
  const MONEY_DAYS: Record<string, string> = {
    "2026-06-12": "2026-05-01",
    "2026-07-10": "2026-06-01",
    "2026-08-14": "2026-07-01",
    "2026-09-11": "2026-08-01",
    "2026-10-16": "2026-09-01",
  };
  const OPS_WAVE = [0, 1600, 2700, 600, 1900, -300, 1200, 2300];
  const snapshots: SnapshotRow[] = [];
  let maint = 4200;
  let tax = 6200;
  let vault = 4000;
  let fri = "2026-05-01";
  for (let k = 0; fri <= "2026-10-30"; k++, fri = addDays(fri, 7)) {
    const week = payWeekOf(addDays(fri, -3)); // the pay week that closed last Tuesday
    const wm = weekOdometerMiles(readings, week).miles;
    const accrued = wm == null ? null : wm;
    if (accrued != null) maint = round2(maint + accrued * 0.32);
    maint = round2(Math.max(2500, maint - round2(REPAIRS[Math.max(0, MONTHS.indexOf(monthKey(fri)))] / 4.33)));
    tax = round2(tax + 310);
    let ops = 10800 + OPS_WAVE[k % OPS_WAVE.length];
    const month = MONEY_DAYS[fri] ?? null;
    let taxMoved: number | null = null;
    let surplus: number | null = null;
    let objective: number | null = null;
    let household: number | null = null;
    if (month) {
      const p = periods.find((x) => x.period_month === month) as ExpensePeriod;
      const pretax = (p.income_total ?? 0) - (p.cogs_total ?? 0) - (p.expense_total ?? 0);
      taxMoved = round2(Math.max(0, pretax * 0.2));
      surplus = round2(Math.max(0, (pretax - taxMoved) * 0.5));
      objective = round2(surplus * 0.7);
      household = round2(surplus - objective);
      tax = round2(tax + taxMoved);
      vault = round2(vault + objective);
      ops = round2(ops + 1500); // the money day runs on a fat Friday
    }
    snapshots.push({
      snapshot_id: `snap-${fri}`,
      as_of: fri,
      created_at: stamp(fri, "22:00"),
      note: null,
      miles: accrued,
      pay_week_start: accrued == null ? null : week.start,
      settles_month: month,
      tax_moved: taxMoved == null ? null : fixed(taxMoved),
      surplus_moved: surplus == null ? null : fixed(surplus),
      objective_moved: objective == null ? null : fixed(objective),
      household_moved: household == null ? null : fixed(household),
      balances: [
        { account_id: "acct-ops", balance: fixed(ops) },
        { account_id: "acct-maint", balance: fixed(maint) },
        { account_id: "acct-tax", balance: fixed(tax) },
        { account_id: "acct-vault", balance: fixed(vault) },
      ],
    });
  }

  // ---- planning assumptions and the one OPS NOW check ----
  const assumptions: CashAssumptionsRow = {
    weekly_revenue: "3600.00",
    weekly_payroll: "1300.00",
    monthly_depreciation: "1850.00",
    fed_tax_rate: "0.22",
    state_tax_rate: "0.00",
    financing_floor: "10000.00",
    tax_catchup_owed: "2400.00",
    weekly_fuel_advance: "2000.00",
    weekly_settlement_deductions: "175.00",
  };
  const opsChecks: OpsCheckRow[] = [
    { check_id: "check-1", as_of: TODAY, created_at: stamp(TODAY, "14:05"), balance: "11240.15", note: "OPS NOW", deposit_landed: null },
  ];

  return {
    loads,
    trips,
    periods,
    obligations,
    schedule,
    splits,
    perDiemRates,
    payRates,
    settlements,
    settlementLines,
    fuel,
    snapshots,
    accounts,
    plan,
    assumptions,
    opsChecks,
    accessorials,
    financials,
  };
};

// A filed month with a piece knocked out — the unfiled-month seed. By default
// cogs_total goes null (October ’26 saved exactly that). Lines are copied, so
// the base is never touched.
export const brokenPeriod = (base: ExpensePeriod, patch: Partial<ExpensePeriod> = {}): ExpensePeriod => ({
  ...base,
  lines: base.lines?.map((l) => ({ ...l })),
  cogs_total: null,
  ...patch,
});
