import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import {
  inboundStrength,
  reloadYardstick,
  IN_MIN_LOADS,
  type GradeCosts,
} from "./marketFactor";

// The ladder's costs: empty miles at $3 a mile, an idle weekday at $773, and
// the margin goal 15% — strong when the reload eats 15% or less of the load it
// led to, soft at 30% or more.
const COSTS: GradeCosts = { perMile: 3, perDay: 773, dayBreakEven: 1008, dayTarget: 1186, marginGoal: 0.15 };
import {
  buildLedger,
  ledgerFolded,
  ledgerHeadline,
  marketDetail,
  reloadSummary,
  repeatLanes,
  sequenceLoads,
  stripMarket,
  windowLoads,
  type LedgerWindow,
  type SequencedLoad,
} from "./marketLedger";

const makeLoad = (over: Partial<Load>): Load => ({
  load_id: "L",
  load_number: "1",
  load_type: "oversize",
  load_status: "delivered",
  agency_id: "b",
  agency_code: "B",
  posting_code: null,
  agent_id: "a1",
  agent: "Brian Williams",
  agent_email: null,
  pickup_date: "2026-06-01",
  origin_market_id: "m",
  origin_city: "Greenville",
  origin_state: "SC",
  origin_market: "Greenville Market",
  receiver_name: null,
  delivery_date: "2026-06-03",
  destination_market_id: "m2",
  destination_city: "Washington",
  destination_state: "VA",
  delivery_market: "Washington DC Market",
  deadhead_miles: 0,
  loaded_miles: 1000,
  linehaul: "3000",
  fuel_surcharge: "0",
  total_accessorials: "0",
  commodity: null,
  odometer_start: null,
  odometer_end: null,
  payment_status: "unpaid",
  created_at: "",
  updated_at: "",
  ...over,
});

// ---------------------------------------------------------------- windows

describe("windowLoads", () => {
  // Central is the account's clock — the test env pins TZ to America/Chicago.
  const NEW_YEARS_EVE = new Date("2027-01-01T04:00:00Z"); // 10pm Dec 31 Central
  const NEW_YEARS_DAY = new Date("2027-01-01T06:30:00Z"); // 12:30am Jan 1 Central

  const book = [
    makeLoad({ load_id: "a", delivery_date: "2026-12-31" }),
    makeLoad({ load_id: "b", delivery_date: "2026-01-02" }),
    makeLoad({ load_id: "c", delivery_date: "2025-06-01" }), // >12m before 2026-12-31
    makeLoad({ load_id: "d", delivery_date: "2027-01-01" }),
    makeLoad({ load_id: "e", delivery_date: "2026-11-01", load_status: "booked" }),
    makeLoad({ load_id: "f", delivery_date: null }),
  ];

  it("keeps delivered loads only", () => {
    expect(
      windowLoads(book, "all", NEW_YEARS_EVE).map((l) => l.load_id),
    ).not.toContain("e");
  });

  it("12m counts back 365 days from TODAY in Central time", () => {
    const ids = windowLoads(book, "12m", NEW_YEARS_EVE).map((l) => l.load_id);
    expect(ids).toContain("a");
    expect(ids).toContain("b"); // 2026-01-02 is inside 2025-12-31 → today
    expect(ids).not.toContain("c");
  });

  it("ytd follows the LOCAL year, not UTC's", () => {
    // 10pm Dec 31 Central is already Jan 1 in UTC — reading UTC here would
    // blank the whole year on New Year's Eve.
    expect(windowLoads(book, "ytd", NEW_YEARS_EVE).map((l) => l.load_id)).toEqual([
      "a",
      "b",
    ]);
    expect(windowLoads(book, "ytd", NEW_YEARS_DAY).map((l) => l.load_id)).toEqual([
      "d",
    ]);
  });

  it("all takes every delivered load", () => {
    expect(windowLoads(book, "all", NEW_YEARS_EVE)).toHaveLength(5);
  });
});

// --------------------------------------------------------------- sequence

describe("sequenceLoads", () => {
  const book = [
    makeLoad({
      load_id: "third",
      pickup_date: "2026-06-20",
      delivery_date: "2026-06-22",
      deadhead_miles: 300,
      origin_state: "OH",
      origin_market: "Columbus Market",
      loaded_miles: 500,
      linehaul: "2500",
    }),
    makeLoad({
      load_id: "first",
      pickup_date: "2026-06-01",
      delivery_date: "2026-06-03",
    }),
    makeLoad({
      load_id: "second",
      pickup_date: "2026-06-04",
      delivery_date: "2026-06-06",
      deadhead_miles: 0, // logged as zero = not logged, never free
    }),
    makeLoad({ load_id: "nodate", pickup_date: "" }),
  ];

  const seq = sequenceLoads(book);

  it("orders by pickup then delivery, and drops loads with no pickup date", () => {
    expect(seq.map((s) => s.load.load_id)).toEqual(["first", "second", "third"]);
  });

  it("reads a 0 deadhead as 'not logged', never as a free reload", () => {
    expect(seq[0].next?.deadheadMiles).toBeNull();
  });

  it("carries the next load's reload, idle days, market and rate", () => {
    expect(seq[1].next).toMatchObject({
      deadheadMiles: 300,
      deadheadSource: "planned",
      idleDays: 10, // Sat Jun 6 → Sat Jun 20: ten weekdays, not fourteen days
      calendarDays: 14,
      originState: "OH",
      originMarket: "Columbus",
      pickupDay: "2026-06-20",
    });
    expect(seq[1].next?.rpm).toBeCloseTo(5, 5); // 2500 / 500
  });

  it("gives the last load no next", () => {
    expect(seq[2].next).toBeNull();
  });

  it("flags idle over a week as home time — 8 days yes, 7 days no", () => {
    const at = (gap: number) =>
      sequenceLoads([
        makeLoad({ load_id: "x", pickup_date: "2026-06-01", delivery_date: "2026-06-03" }),
        makeLoad({
          load_id: "y",
          pickup_date: `2026-06-${String(3 + gap).padStart(2, "0")}`,
          delivery_date: "2026-06-25",
        }),
      ])[0];
    expect(at(7).next?.calendarDays).toBe(7);
    expect(at(7).next?.idleDays).toBe(5); // Wed Jun 3 → Wed Jun 10: five weekdays
    expect(at(7).home).toBe(false);
    expect(at(8).home).toBe(true);
  });

  it("a logged home trip marks home time whatever the gap — Thursday to Monday is home, not idle", () => {
    const pair = [
      makeLoad({ load_id: "a", pickup_date: "2026-06-02", delivery_date: "2026-06-04" }), // Thu
      makeLoad({ load_id: "b", pickup_date: "2026-06-08", delivery_date: "2026-06-10", deadhead_miles: 400 }), // Mon
    ];
    const away = sequenceLoads(pair)[0];
    expect(away.home).toBe(false);
    expect(away.next?.idleDays).toBe(2); // Fri, Mon
    const home = sequenceLoads(pair, [{ trip_date: "2026-06-05", trip_purpose: "home", status: "completed" }])[0];
    expect(home.home).toBe(true);
    // a shop trip, or a cancelled home trip, marks nothing
    expect(sequenceLoads(pair, [{ trip_date: "2026-06-05", trip_purpose: "shop" }])[0].home).toBe(false);
    expect(sequenceLoads(pair, [{ trip_date: "2026-06-05", trip_purpose: "home", status: "cancelled" }])[0].home).toBe(false);
  });

  it("a weekend reload is not idle: Friday to Monday is one weekday", () => {
    const [first] = sequenceLoads([
      makeLoad({ load_id: "f", pickup_date: "2026-06-03", delivery_date: "2026-06-05" }), // Fri
      makeLoad({ load_id: "m", pickup_date: "2026-06-08", delivery_date: "2026-06-10" }), // Mon
    ]);
    expect(first.next).toMatchObject({ idleDays: 1, calendarDays: 3 });
  });

  it("empty miles come from the odometer: the next load's window minus its loaded miles when its start copies the previous end (Jason's chain), the gap between the loads when a fresh reading was taken, else the planned deadhead", () => {
    // the chain: y starts where x ended; y's window (1500 → 2100) holds 450 loaded miles → 150 empty
    const chain = sequenceLoads([
      makeLoad({ load_id: "x", pickup_date: "2026-06-01", delivery_date: "2026-06-03", odometer_start: 1000, odometer_end: 1500 }),
      makeLoad({ load_id: "y", pickup_date: "2026-06-04", delivery_date: "2026-06-06", odometer_start: 1500, odometer_end: 2100, loaded_miles: 450, deadhead_miles: 300 }),
    ])[0];
    expect(chain.next).toMatchObject({ deadheadMiles: 150, deadheadSource: "odometer" });
    // a fresh reading at the pickup: the gap between the loads is the empty run
    const odo = sequenceLoads([
      makeLoad({ load_id: "x", pickup_date: "2026-06-01", delivery_date: "2026-06-03", odometer_start: 1000, odometer_end: 1500 }),
      makeLoad({ load_id: "y", pickup_date: "2026-06-04", delivery_date: "2026-06-06", odometer_start: 1650, deadhead_miles: 300 }),
    ])[0];
    expect(odo.next).toMatchObject({ deadheadMiles: 150, deadheadSource: "odometer" });
    // the chain with a window that holds exactly the loaded miles: nothing to read → the planned field
    const flat = sequenceLoads([
      makeLoad({ load_id: "x", pickup_date: "2026-06-01", delivery_date: "2026-06-03", odometer_end: 1500 }),
      makeLoad({ load_id: "y", pickup_date: "2026-06-04", delivery_date: "2026-06-06", odometer_start: 1500, odometer_end: 1950, loaded_miles: 450, deadhead_miles: 300 }),
    ])[0];
    expect(flat.next).toMatchObject({ deadheadMiles: 300, deadheadSource: "planned" });
    const planned = sequenceLoads([
      makeLoad({ load_id: "x", pickup_date: "2026-06-01", delivery_date: "2026-06-03", odometer_end: 1500 }),
      makeLoad({ load_id: "y", pickup_date: "2026-06-04", delivery_date: "2026-06-06", odometer_start: null, deadhead_miles: 300 }),
    ])[0];
    expect(planned.next).toMatchObject({ deadheadMiles: 300, deadheadSource: "planned" });
  });

  it("never reads a NEGATIVE idle — an overlapping pair sits 0 days, not −5", () => {
    // The next load picks up five days before this one delivers: a relay, or a
    // corrected date. The truck waited no days; it did not wait minus five.
    const [first] = sequenceLoads([
      makeLoad({ load_id: "long", pickup_date: "2026-06-01", delivery_date: "2026-06-10" }),
      makeLoad({ load_id: "overlap", pickup_date: "2026-06-05", delivery_date: "2026-06-12" }),
    ]);
    expect(first.next?.idleDays).toBe(0);
    expect(first.home).toBe(false);
  });
});

// ------------------------------------------------------------- the IN rule

// Every leg leads to a $4,000 load, so a reload's share is its dollars ÷ 4,000:
// 100 mi with no wait is $300 (7.5%, strong); 270 mi and a day is $1,583 (40%,
// soft); 250 mi and no wait is $750 (19%, fair). Four deliveries make a market
// gradable — one minimum for soft and strong.
const leg = (
  state: string,
  deadheadMiles: number | null,
  idleDays: number,
  home = false,
): SequencedLoad => ({
  load: makeLoad({ destination_state: state }),
  home,
  next: {
    deadheadMiles,
    deadheadSource: deadheadMiles == null ? null : "planned",
    idleDays,
    calendarDays: idleDays,
    originState: state,
    originMarket: null,
    rpm: 6,
    gross: 4000,
    pickupDay: "2026-06-10",
  },
});

const BOOK: SequencedLoad[] = [
  leg("OH", 100, 0),
  leg("OH", 110, 0),
  leg("OH", 121, 0),
  leg("OH", 100, 0),
  leg("TX", 260, 1),
  leg("TX", 280, 2),
  leg("TX", 300, 2),
  leg("TX", 270, 1),
  leg("VA", 240, 0),
  leg("VA", 260, 0),
  leg("VA", 250, 1),
  leg("VA", null, 17, true), // a week off doesn't grade a market
  leg("TN", 186, 4),
  leg("TN", 190, 4),
  leg("TN", 184, 4),
  leg("TN", 188, 4),
  leg("GA", 90, 1),
  leg("GA", 95, 1),
  leg("SC", 137, 1),
  leg("NM", null, 1),
  leg("NM", null, 1),
];

describe("inboundStrength — the reload in dollars, as a share of the load it led to", () => {
  const map = inboundStrength(BOOK, COSTS);

  it("STRONG — a cheap reload with no wait eats under your margin goal", () => {
    expect(map.get("OH")).toMatchObject({ deliveries: 4, reloadMilesMedian: 105, grade: "strong" });
    expect(map.get("OH")?.reloadCostMedian).toBeCloseTo(315, 5); // 105 mi × $3
    expect(map.get("OH")?.shareMedian).toBeCloseTo(315 / 4000, 5);
    expect(map.get("OH")?.idleDaysAvg).toBe(0);
  });

  it("SOFT on the reload's dollars — a long reload and a day's wait eat 40%", () => {
    expect(map.get("TX")).toMatchObject({ reloadMilesMedian: 275, grade: "soft" });
    expect(map.get("TX")?.shareMedian).toBeGreaterThanOrEqual(0.3);
  });

  it("SOFT on idle alone — four days waiting is $3,092 before a mile is driven", () => {
    expect(map.get("TN")).toMatchObject({ idleDaysAvg: 4, grade: "soft" });
    expect(map.get("TN")?.reloadCostMedian).toBeGreaterThan(3092);
  });

  it("FAIR — between the goal and twice it", () => {
    expect(map.get("VA")).toMatchObject({ deliveries: 4, reloadMilesMedian: 250, grade: "fair" });
    expect(map.get("VA")?.shareMedian).toBeCloseTo(780 / 4000, 5); // the middle leg: 260 mi, no wait — 19.5%
    // the 17-day home week is out of every median, not averaged in
    expect(map.get("VA")?.idleDaysAvg).toBeCloseTo(1 / 3, 5);
  });

  it("THIN under four deliveries, however cheap the reload — the same minimum as strong", () => {
    expect(map.get("GA")).toMatchObject({ reloadMilesMedian: 92.5, grade: "thin" });
    expect(map.get("GA")?.deliveries).toBeLessThan(IN_MIN_LOADS);
  });

  it("without the ladder's costs every market is thin — the figures still print", () => {
    const bare = inboundStrength(BOOK);
    expect(bare.get("OH")).toMatchObject({ reloadMilesMedian: 105, shareMedian: null, grade: "thin" });
  });

  it("THIN on one delivery, and THIN when no reload was ever logged", () => {
    expect(map.get("SC")?.grade).toBe("thin");
    expect(map.get("NM")).toMatchObject({
      deliveries: 2,
      reloadMilesMedian: null,
      grade: "thin",
    });
  });

  it("carries the next load's typical rate", () => {
    expect(map.get("OH")?.nextRpmMedian).toBeCloseTo(6, 5);
  });
});

// ----------------------------------------------------------- the ledger

const NOW = new Date("2026-07-01T12:00:00Z");

const out = (over: Partial<Load>): Load =>
  makeLoad({ delivery_date: "2026-06-15", pickup_date: "2026-06-13", ...over });

const BOOK_LOADS: Load[] = [
  // SC → VA, the money market: 2 loads at $6/mi
  out({ load_id: "s1", origin_state: "SC", loaded_miles: 500, linehaul: "3000" }),
  out({
    load_id: "s2",
    origin_state: "SC",
    loaded_miles: 500,
    linehaul: "3000",
    agent_id: "a2",
    agent: "Jamie Canfield",
    pickup_date: "2026-06-16",
    delivery_date: "2026-06-18",
  }),
  // OH → VA, 2 loads at $2/mi
  out({
    load_id: "o1",
    origin_state: "OH",
    origin_market: "Columbus Market",
    loaded_miles: 1000,
    linehaul: "2000",
    pickup_date: "2026-06-20",
    delivery_date: "2026-06-22",
    deadhead_miles: 150,
  }),
  out({
    load_id: "o2",
    origin_state: "OH",
    origin_market: "Toledo Market",
    loaded_miles: 1000,
    linehaul: "2000",
    pickup_date: "2026-06-24",
    delivery_date: "2026-06-26",
    deadhead_miles: 250,
  }),
  // one lonely AZ origin, delivering to VA as well
  out({
    load_id: "z1",
    origin_state: "AZ",
    origin_market: "Phoenix Market",
    loaded_miles: 1000,
    linehaul: "2500",
    pickup_date: "2026-06-28",
    delivery_date: "2026-06-30",
  }),
];

describe("buildLedger", () => {
  const rows = buildLedger(BOOK_LOADS, "12m", NOW);
  const row = (k: string) => rows.find((r) => r.state === k)!;

  it("gives every market a row, whether freight is born there or lands there", () => {
    expect(new Set(rows.map((r) => r.state))).toEqual(
      new Set(["SC", "OH", "AZ", "VA"]),
    );
    expect(row("VA").out.loads).toBe(0);
    expect(row("VA").in.deliveries).toBe(5);
  });

  it("names the market and lists its origin markets, suffix stripped", () => {
    expect(row("OH").name).toBe("Ohio");
    expect(row("OH").markets).toEqual(["Columbus", "Toledo"]);
  });

  it("fills the OUT half on typical (median) $/mi, weighted $/day, agents", () => {
    expect(row("SC").out).toMatchObject({ loads: 2, agents: 2 });
    expect(row("SC").out.typicalRpm).toBeCloseTo(6, 5);
    expect(row("SC").out.blendedRpm).toBeCloseTo(6, 5);
    expect(row("SC").out.perDay.perDay).toBeCloseTo(1000, 5); // 6000 / 6 days
    expect(row("SC").out.gross).toBeCloseTo(6000, 5);
  });

  it("fills the IN half from the load sequence, 0 deadheads excluded", () => {
    // Of the five VA deliveries, only two next-loads logged a deadhead
    // (150, 250) — the rest are zeroes, which are not reloads of 0 miles.
    expect(row("VA").in.reloadMilesMedian).toBeCloseTo(200, 5);
    expect(row("VA").in.reloadMilesAvg).toBeCloseTo(200, 5);
    // idle, in weekdays: 1 (Mon → Tue), 1 (Thu → Sat: Friday only), 2 (Mon → Wed),
    // 0 (Fri → Sun: no weekday) — the last load you've run has no next and no idle
    expect(row("VA").in.idleDaysAvg).toBeCloseTo(1, 5);
  });

  it("sorts by OUT $/mi among 2+ load markets, then the rest by deliveries", () => {
    expect(rows.map((r) => r.state)).toEqual(["SC", "OH", "VA", "AZ"]);
  });

  it("grades OUT with the Load Scorer's own rule — thin under four loads, the same minimum as strong", () => {
    expect(row("AZ").out.grade).toBe("thin");
    expect(row("SC").out.grade).toBe("thin"); // two loads print their figure, carry no grade
    // four SC loads at $1,000–$1,500 a day ex-fuel: the median $1,250 clears the $1,186 target → strong
    const more = [
      ...BOOK_LOADS,
      out({ load_id: "s3", origin_state: "SC", loaded_miles: 500, linehaul: "3000", pickup_date: "2026-06-08", delivery_date: "2026-06-09" }),
      out({ load_id: "s4", origin_state: "SC", loaded_miles: 500, linehaul: "3000", pickup_date: "2026-06-10", delivery_date: "2026-06-11" }),
    ];
    const sc = buildLedger(more, "12m", NOW, "state", [], COSTS).find((r) => r.state === "SC")!;
    expect(sc.out.perDayExFuel).toBeCloseTo(1250, 5);
    expect(sc.out.grade).toBe("strong");
  });

  it("leaves an UNDATED delivery out of the IN half — same deliveries, same grade", () => {
    // Delivered to VA, but the book never gave it a pickup date, so it has no
    // place in the sequence and no reload story. It must move neither the
    // count the row prints nor the count the grade is read off.
    const withUndated = buildLedger(
      [
        ...BOOK_LOADS,
        out({
          load_id: "u1",
          origin_state: "SC",
          destination_state: "VA",
          pickup_date: "",
        }),
      ],
      "12m",
      NOW,
    );
    const va = (rs: typeof rows) => rs.find((r) => r.state === "VA")!;
    expect(va(withUndated).in.deliveries).toBe(va(rows).in.deliveries);
    expect(va(withUndated).in.grade).toBe(va(rows).in.grade);
  });

  it("rolls up to freight regions on the same code path", () => {
    const regions = buildLedger(BOOK_LOADS, "12m", NOW, "region");
    const southeast = regions.find((r) => r.state === "Southeast")!;
    // SC + VA are both Southeast: 2 loads born there, 5 delivered there.
    expect(southeast.out.loads).toBe(2);
    expect(southeast.in.deliveries).toBe(5);
    // …and the rate is recomputed from the loads, not averaged from state rows
    expect(southeast.out.typicalRpm).toBeCloseTo(6, 5);
    expect(regions.find((r) => r.state === "Mountain")?.out.loads).toBe(1); // AZ
  });
});

// A market's IN grade is read against your COST, never against the window's
// own slice — so flipping 12 months → this year → all time cannot re-grade a
// market whose own numbers didn't move. (The median reload is still printed
// as context, over the whole sequence, home stints out.)
describe("the IN grade is the same in every window", () => {
  // Old era, all delivering to FL, with long reloads (400–460) that only the
  // "all" window can see. Recent era, all in the last 12 months, delivering to
  // OH with cheap reloads (60–90).
  const trip = (
    id: string,
    pickup: string,
    delivery: string,
    destination_state: string,
    deadhead_miles: number,
  ): Load =>
    makeLoad({
      load_id: id,
      pickup_date: pickup,
      delivery_date: delivery,
      destination_state,
      deadhead_miles,
      loaded_miles: 1000,
      linehaul: "3000",
    });

  const ERAS: Load[] = [
    trip("x1", "2024-01-01", "2024-01-03", "FL", 0),
    trip("x2", "2024-01-05", "2024-01-07", "FL", 400),
    trip("x3", "2024-01-09", "2024-01-11", "FL", 420),
    trip("x4", "2024-01-13", "2024-01-15", "FL", 440),
    trip("r1", "2026-06-01", "2026-06-03", "OH", 460),
    trip("r2", "2026-06-05", "2026-06-07", "OH", 60),
    trip("r3", "2026-06-09", "2026-06-11", "OH", 70),
    trip("r4", "2026-06-13", "2026-06-15", "OH", 80),
    trip("r5", "2026-06-17", "2026-06-19", "TX", 90),
  ];

  const ohio = (win: LedgerWindow) =>
    buildLedger(ERAS, win, NOW, "state", [], COSTS).find((r) => r.state === "OH")!;

  it("takes the median reload off every logged leg, all time — home legs out", () => {
    // 60, 70, 80, 90, 400, 420, 440 → 90 mi. (The 460-mile run into r1 came after a
    // two-year gap — home time, out of the yardstick.)
    expect(reloadYardstick(sequenceLoads(ERAS))).toBeCloseTo(90, 5);
  });

  it("keeps OH's own numbers and grade identical across 12m, ytd and all", () => {
    const grades = new Set<string>();
    for (const win of ["12m", "ytd", "all"] as const) {
      expect(ohio(win).in.deliveries).toBe(4);
      expect(ohio(win).in.reloadMilesMedian).toBeCloseTo(75, 5);
      expect(ohio(win).in.idleDaysAvg).toBeCloseTo(1.75, 5); // weekdays: 2, 2, 1 (a Saturday pickup), 2
      grades.add(ohio(win).in.grade);
    }
    expect(grades.size).toBe(1);
    // 70-ish miles is cheap, but the days between these loads are not: ~1.75
    // weekdays at $773 on a $3,000 load — the reload eats over half of it.
    expect(ohio("12m").in.shareMedian).toBeGreaterThan(0.5);
    expect(ohio("12m").in.grade).toBe("soft");
  });
});

describe("ledgerFolded", () => {
  it("folds the markets thin on BOTH halves and counts what went under", () => {
    const rows = buildLedger(BOOK_LOADS, "12m", NOW);
    const fold = ledgerFolded(rows);
    expect(fold.shown.map((r) => r.state)).toEqual(["SC", "OH", "VA"]);
    expect(fold.foldedOrigins).toEqual(["AZ"]);
    expect(fold.foldedDeliveryStates).toBe(0);
  });
});

// ------------------------------------------------------------ repeat lanes

describe("repeatLanes", () => {
  const lanes = repeatLanes(BOOK_LOADS, "12m", NOW);

  it("keeps only the lanes you've run twice or more, and counts the singles", () => {
    expect(lanes.rows.map((l) => l.lane)).toEqual(["Greenville → Washington DC"]);
    expect(lanes.singles).toBe(3); // Columbus, Toledo and Phoenix ran once
  });

  it("strips the 'Market' suffix and carries the row's context", () => {
    const [top] = lanes.rows;
    expect(top).toMatchObject({
      states: "SC › VA",
      originState: "SC",
      destState: "VA",
      loads: 2,
      lastDay: "2026-06-18",
    });
    expect(top.agents).toEqual(["Brian Williams", "Jamie Canfield"]);
    expect(top.typicalRpm).toBeCloseTo(6, 5);
    expect(top.milesAvg).toBeCloseTo(500, 5);
  });

  it("sorts by loads, then by gross", () => {
    const busy = (id: string, market: string, linehaul: string) =>
      out({ load_id: id, delivery_market: `${market} Market`, linehaul });
    const sorted = repeatLanes(
      [
        busy("a", "Dallas", "1000"),
        busy("b", "Dallas", "1000"),
        busy("c", "Miami", "9000"),
        busy("d", "Miami", "9000"),
        busy("e", "Miami", "9000"),
      ],
      "12m",
      NOW,
    );
    // Miami ran three times, Dallas twice — volume leads, gross breaks ties.
    expect(sorted.rows.map((l) => l.lane)).toEqual([
      "Greenville → Miami",
      "Greenville → Dallas",
    ]);
    expect(sorted.singles).toBe(0);
  });

  it("skips a load missing either market — neither a row nor a single", () => {
    const holed = repeatLanes(
      [
        out({ load_id: "n1", origin_market: "", delivery_market: "Dallas Market" }),
        out({ load_id: "n2", origin_market: "Greenville Market", delivery_market: "" }),
        out({ load_id: "n3" }), // Greenville → Washington DC
        out({ load_id: "n4" }),
      ],
      "12m",
      NOW,
    );
    expect(holed.rows.map((l) => l.lane)).toEqual(["Greenville → Washington DC"]);
    // " → Dallas" and "Greenville → " are not lanes that ran once — they are
    // loads with a hole in them, and they inflate neither count.
    expect(holed.singles).toBe(0);
  });
});

describe("stripMarket", () => {
  it("drops the suffix nobody says out loud", () => {
    expect(stripMarket("Washington DC Market")).toBe("Washington DC");
    expect(stripMarket("Greenville")).toBe("Greenville");
    expect(stripMarket(null)).toBe("");
  });
});

// ----------------------------------------------------------- market detail

describe("marketDetail", () => {
  const seq = sequenceLoads(BOOK_LOADS);
  const detail = marketDetail(BOOK_LOADS, seq, "12m", NOW, "VA");

  it("lists the deliveries newest first, with where they came from", () => {
    expect(detail.deliveries.map((d) => d.deliveredDay)).toEqual([
      "2026-06-30",
      "2026-06-26",
      "2026-06-22",
      "2026-06-18",
      "2026-06-15",
    ]);
    expect(detail.deliveries[0]).toMatchObject({
      deliveredMarket: "Washington DC",
      fromMarket: "Phoenix",
    });
  });

  it("carries what came next — the reload, the idle days, the market", () => {
    const june15 = detail.deliveries[detail.deliveries.length - 1];
    expect(june15.next).toMatchObject({
      pickupDay: "2026-06-16",
      originMarket: "Greenville",
      idleDays: 1,
    });
    // the last load you've run has no next at all
    expect(detail.deliveries[0].next).toBeNull();
  });

  it("scopes the agents to the loads born in the market, not the deliveries", () => {
    expect(detail.loadsOut).toHaveLength(0); // nothing is born in VA
    expect(detail.agents).toHaveLength(0);
    const sc = marketDetail(BOOK_LOADS, seq, "12m", NOW, "SC");
    expect(sc.agents.map((a) => a.agent)).toEqual([
      "Brian Williams",
      "Jamie Canfield",
    ]);
  });
});

// --------------------------------------------------------- answering line

describe("ledgerHeadline", () => {
  const rows = buildLedger(BOOK_LOADS, "12m", NOW);
  const head = ledgerHeadline(rows, windowLoads(BOOK_LOADS, "12m", NOW));

  it("counts the window, its origins and its delivery markets", () => {
    expect(head).toMatchObject({ loads: 5, originStates: 3, deliveryStates: 1 });
  });

  it("shares the empty miles over total miles", () => {
    // 400 deadhead over 400 + 4000 loaded
    expect(head.emptyShare).toBeCloseTo(400 / 4400, 5);
  });

  it("crowns the best market to load, and the easiest / costliest to leave — once a market has four loads to grade on", () => {
    // SC on two loads is thin (and without the ladder's costs every grade is), so the book as it stands crowns nothing out.
    expect(head.bestOut).toBeNull();
    const more = [
      ...BOOK_LOADS,
      out({ load_id: "s3", origin_state: "SC", loaded_miles: 500, linehaul: "3000", pickup_date: "2026-06-08", delivery_date: "2026-06-09" }),
      out({ load_id: "s4", origin_state: "SC", loaded_miles: 500, linehaul: "3000", pickup_date: "2026-06-10", delivery_date: "2026-06-11" }),
    ];
    const four = ledgerHeadline(buildLedger(more, "12m", NOW, "state", [], COSTS), windowLoads(more, "12m", NOW));
    expect(four.bestOut?.state).toBe("SC");
    expect(four.easiestIn?.state).toBe("VA");
    expect(four.costliestIn?.state).toBe("VA");
  });

  it("is null, never zero, when the book is too thin to say", () => {
    const thin = ledgerHeadline([], []);
    expect(thin).toMatchObject({
      loads: 0,
      originStates: 0,
      deliveryStates: 0,
      emptyShare: null,
      undated: 0,
      bestOut: null,
      easiestIn: null,
      costliestIn: null,
    });
  });

  // The counts come off the WINDOW'S LOADS, not off the rows: a load the book
  // never gave a recognised origin state is still one of your loads, and a
  // load with no pickup date still burned miles.
  const ODD_BOOK: Load[] = [
    out({
      load_id: "h1",
      origin_state: "SC",
      destination_state: "VA",
      deadhead_miles: 100,
      loaded_miles: 400,
    }),
    out({
      load_id: "h2",
      origin_state: "ZZ", // an origin the states table doesn't know
      destination_state: "VA",
      deadhead_miles: 0,
      loaded_miles: 500,
    }),
    out({
      load_id: "h3",
      origin_state: "SC",
      destination_state: "TX",
      deadhead_miles: 100,
      loaded_miles: 500,
      pickup_date: "", // delivered, never dated — no place in the sequence
    }),
  ];
  const odd = ledgerHeadline(
    buildLedger(ODD_BOOK, "12m", NOW),
    windowLoads(ODD_BOOK, "12m", NOW),
  );

  it("counts every load in the window, even one no row could be built from", () => {
    expect(odd.loads).toBe(3);
    expect(odd.originStates).toBe(1); // SC; "ZZ" is not a state, so not counted
    expect(odd.deliveryStates).toBe(2); // VA and TX
  });

  it("shares the miles over the SAME loads — a 0 deadhead here really is 0", () => {
    // 100 + 0 + 100 empty over 200 + 1400 loaded. The undated load's miles
    // count: this is a mileage share, not the reload signal.
    expect(odd.emptyShare).toBeCloseTo(200 / 1600, 5);
  });

  it("says once how many delivered loads carry no pickup date", () => {
    expect(odd.undated).toBe(1);
    expect(head.undated).toBe(0);
  });
});

// ------------------------------------------------------------ market grain

// A four-load sequence that exercises both halves at market grain:
//   A  Charlotte NC  → Dallas TX    06-01 → 06-03
//   B  Dallas TX     → Houston TX   06-05 → 06-07   (reloaded 40 mi)
//   C  Greenville SC → Dallas TX    06-10 → 06-12   (reloaded 200 mi)
//   D  Charlotte NC  → Atlanta GA   06-15 → 06-17   (reloaded 300 mi)
// Atlanta is a market seen ONLY as a destination. Dallas and Houston are both
// in TX, so a state-grain run folds them together — at market grain they must
// stand apart, which is the whole point of the grain.
const GRAIN_NOW = new Date("2026-08-01T12:00:00Z");
const GRAIN_BOOK: Load[] = [
  makeLoad({
    load_id: "A", pickup_date: "2026-06-01", delivery_date: "2026-06-03",
    origin_market: "Charlotte Market", origin_state: "NC",
    delivery_market: "Dallas Market", destination_state: "TX",
    loaded_miles: 1000, linehaul: "3000",
  }),
  makeLoad({
    load_id: "B", pickup_date: "2026-06-05", delivery_date: "2026-06-07",
    origin_market: "Dallas Market", origin_state: "TX",
    delivery_market: "Houston Market", destination_state: "TX",
    loaded_miles: 1000, linehaul: "4000", deadhead_miles: 40,
  }),
  makeLoad({
    load_id: "C", pickup_date: "2026-06-10", delivery_date: "2026-06-12",
    origin_market: "Greenville Market", origin_state: "SC",
    delivery_market: "Dallas Market", destination_state: "TX",
    loaded_miles: 1000, linehaul: "6000", deadhead_miles: 200,
  }),
  makeLoad({
    load_id: "D", pickup_date: "2026-06-15", delivery_date: "2026-06-17",
    origin_market: "Charlotte Market", origin_state: "NC",
    delivery_market: "Atlanta Market", destination_state: "GA",
    loaded_miles: 1000, linehaul: "5000", deadhead_miles: 300,
  }),
];

describe("buildLedger — market grain", () => {
  const rows = buildLedger(GRAIN_BOOK, "all", GRAIN_NOW, "market", [], COSTS);
  const row = (key: string) => rows.find((r) => r.state === key)!;

  it("keys every row on the STRIPPED market name, not on the state", () => {
    expect(rows.map((r) => r.state).sort()).toEqual([
      "Atlanta", "Charlotte", "Dallas", "Greenville", "Houston",
    ]);
  });

  it("keeps two markets in the same state apart", () => {
    // Dallas and Houston are both TX; a state grain would have one row.
    expect(row("Dallas").in.deliveries).toBe(2); // A and C
    expect(row("Houston").in.deliveries).toBe(1); // B
  });

  it("rolls a market's OUT half up over its own loads", () => {
    expect(row("Charlotte").out.loads).toBe(2); // A and D
    // median of $3.00 and $5.00 a loaded mile
    expect(row("Charlotte").out.typicalRpm).toBeCloseTo(4, 5);
  });

  it("gives a destination-only market an IN half and an empty OUT half — never a zero rate", () => {
    const atlanta = row("Atlanta");
    expect(atlanta.in.deliveries).toBe(1);
    expect(atlanta.out.loads).toBe(0);
    expect(atlanta.out.typicalRpm).toBeNull(); // null, NOT 0
    expect(atlanta.out.blendedRpm).toBeNull();
    expect(atlanta.out.grade).toBe("thin");
  });

  it("prints the modal state code beside the market, falling back to the delivery side", () => {
    expect(row("Charlotte").abbr).toBe("NC");
    expect(row("Greenville").abbr).toBe("SC");
    // Atlanta has no OUT loads, so its code comes off its deliveries.
    expect(row("Atlanta").abbr).toBe("GA");
  });

  it("counts a reload into the SAME MARKET, not merely the same state", () => {
    // A delivers into Dallas and its next load loads in Dallas → 1.
    // C also delivers into Dallas but reloads in Charlotte → not counted.
    expect(row("Dallas").in.reloadedInState).toBe(1);
  });

  it("carries the reload SAMPLE beside the median, so the list reads 'within of reloads'", () => {
    const dallas = row("Dallas");
    expect(dallas.in.reloads).toBe(2); // A→40 and C→300, both logged
    expect(dallas.in.reloadMilesMedian).toBeCloseTo(170, 5); // median of 40, 300
    expect(dallas.in.within).toBe(1); // only the 40 is next door
    // Atlanta's one delivery is the last load — no next, so no sample at all.
    expect(row("Atlanta").in.reloads).toBe(0);
    expect(row("Atlanta").in.reloadMilesMedian).toBeNull();
  });
});

describe("ledgerHeadline — market grain", () => {
  const rows = buildLedger(GRAIN_BOOK, "all", GRAIN_NOW, "market", [], COSTS);
  const head = ledgerHeadline(
    rows,
    windowLoads(GRAIN_BOOK, "all", GRAIN_NOW),
    "market",
  );

  it("counts DISTINCT MARKETS on each side", () => {
    expect(head.originStates).toBe(3); // Charlotte, Dallas, Greenville
    expect(head.deliveryStates).toBe(3); // Dallas, Houston, Atlanta
  });
});

// ------------------------------------------------------------ getting empty

describe("reloadSummary", () => {
  const NOW = new Date("2026-08-01T12:00:00Z");

  it("bands the reloads and medians them over the away legs", () => {
    const s = reloadSummary(GRAIN_BOOK, "all", NOW);
    expect(s.legs).toBe(3); // A, B, C have a next; D is the last load
    expect(s.home).toBe(0);
    expect(s.unlogged).toBe(0);
    expect(s.reloads).toBe(3);
    expect(s.medianMiles).toBeCloseTo(200, 5); // median of 40, 200, 300
    expect(s.within).toBe(1); // 40
    expect(s.between).toBe(0); // nothing lands in 86–125
    expect(s.beyond).toBe(2); // 200 and 300
    expect(s.emptyMiles).toBeCloseTo(540, 5);
  });

  it("names a home stint and keeps it out of the sample and every band", () => {
    const book = [
      makeLoad({ load_id: "P", pickup_date: "2026-06-01", delivery_date: "2026-06-03" }),
      makeLoad({ load_id: "Q", pickup_date: "2026-06-25", delivery_date: "2026-06-27", deadhead_miles: 50 }),
    ];
    const s = reloadSummary(book, "all", NOW);
    expect(s.legs).toBe(1);
    expect(s.home).toBe(1);
    // 50 miles would have been "within 85", but the truck was parked on
    // purpose — a home gap is not a market's reload.
    expect(s.reloads).toBe(0);
    expect(s.within).toBe(0);
    expect(s.between).toBe(0);
    expect(s.beyond).toBe(0);
    expect(s.medianMiles).toBeNull();
    expect(s.emptyMiles).toBe(0);
  });

  it("calls a 0 deadhead UNLOGGED, never a free reload next door", () => {
    const book = [
      makeLoad({ load_id: "R", pickup_date: "2026-06-01", delivery_date: "2026-06-03" }),
      makeLoad({ load_id: "S", pickup_date: "2026-06-05", delivery_date: "2026-06-07", deadhead_miles: 0 }),
    ];
    const s = reloadSummary(book, "all", NOW);
    expect(s.legs).toBe(1);
    expect(s.unlogged).toBe(1);
    expect(s.reloads).toBe(0);
    expect(s.within).toBe(0); // a 0 is not "within 85 mi"
    expect(s.medianMiles).toBeNull();
  });

  it("is all zeroes with a null median on an empty window", () => {
    expect(reloadSummary([], "all", NOW)).toEqual({
      legs: 0,
      home: 0,
      unlogged: 0,
      reloads: 0,
      medianMiles: null,
      within: 0,
      between: 0,
      beyond: 0,
      emptyMiles: 0,
    });
  });

  it("agrees with the ledger row's own sample on a one-market book", () => {
    const into = (over: Partial<Load>) =>
      makeLoad({ delivery_market: "Dallas Market", destination_state: "TX", ...over });
    const book = [
      into({ load_id: "X", pickup_date: "2026-06-01", delivery_date: "2026-06-03",
             origin_market: "Charlotte Market", origin_state: "NC" }),
      into({ load_id: "Y", pickup_date: "2026-06-05", delivery_date: "2026-06-07",
             origin_market: "Greenville Market", origin_state: "SC", deadhead_miles: 40 }),
      into({ load_id: "Z", pickup_date: "2026-06-10", delivery_date: "2026-06-12",
             origin_market: "Atlanta Market", origin_state: "GA", deadhead_miles: 200 }),
    ];
    const s = reloadSummary(book, "all", NOW);
    const dallas = buildLedger(book, "all", NOW, "market", [], COSTS).find(
      (r) => r.state === "Dallas",
    )!;
    // Every delivery lands in the one market, so the row's sample IS the book's.
    expect(dallas.in.reloads).toBe(s.reloads);
    expect(dallas.in.within).toBe(s.within);
    expect(s.reloads).toBe(2);
    expect(s.within).toBe(1);
  });
});
