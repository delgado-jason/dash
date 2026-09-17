import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import {
  inboundStrength,
  reloadYardstick,
  IN_IDLE_SOFT,
  IN_STRONG_MIN,
} from "./marketFactor";
import {
  buildLedger,
  ledgerFolded,
  ledgerHeadline,
  marketDetail,
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
      idleDays: 14,
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
    expect(at(7).next?.idleDays).toBe(7);
    expect(at(7).home).toBe(false);
    expect(at(8).home).toBe(true);
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

// A book whose median logged reload is 172.5 mi:
//   90, 95, 100, 110, 121, 137, 170, 175, 180, 186, 190, 260, 280, 300
// → at 85 % / 125 %, strong needs ≤ 146.6 mi and soft starts at 215.6 mi.
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
    idleDays,
    originState: state,
    originMarket: null,
    rpm: 6,
    pickupDay: "2026-06-10",
  },
});

const BOOK: SequencedLoad[] = [
  leg("OH", 100, 1),
  leg("OH", 110, 2),
  leg("OH", 121, 1),
  leg("TX", 260, 1),
  leg("TX", 280, 2),
  leg("TX", 300, 2),
  leg("VA", 170, 1),
  leg("VA", 175, 2),
  leg("VA", 180, 3),
  leg("VA", null, 17, true), // a week off doesn't grade a market
  leg("TN", 186, 4),
  leg("TN", 190, 4),
  leg("GA", 90, 1),
  leg("GA", 95, 1),
  leg("SC", 137, 1),
  leg("NM", null, 1),
  leg("NM", null, 1),
];

describe("inboundStrength", () => {
  const map = inboundStrength(BOOK, reloadYardstick(BOOK));

  it("STRONG — cheap reload, short idle, enough deliveries", () => {
    expect(map.get("OH")).toMatchObject({
      deliveries: 3,
      reloadMilesMedian: 110,
      grade: "strong",
    });
    expect(map.get("OH")?.idleDaysAvg).toBeCloseTo(4 / 3, 5);
  });

  it("SOFT on reload alone — expensive to leave, idle fine", () => {
    expect(map.get("TX")).toMatchObject({ reloadMilesMedian: 280, grade: "soft" });
    expect(map.get("TX")?.idleDaysAvg).toBeLessThan(IN_IDLE_SOFT);
  });

  it("SOFT on idle alone — you sit there", () => {
    expect(map.get("TN")).toMatchObject({ idleDaysAvg: 4, grade: "soft" });
  });

  it("FAIR — in the middle on both", () => {
    expect(map.get("VA")).toMatchObject({
      deliveries: 4,
      reloadMilesMedian: 175,
      grade: "fair",
    });
    // the 17-day home week is out of the average, not averaged in
    expect(map.get("VA")?.idleDaysAvg).toBeCloseTo(2, 5);
  });

  it("FAIR when the reload is cheap but the evidence is thin", () => {
    // 92.5 mi would be strong on 3+ deliveries; on two it is only fair.
    expect(map.get("GA")).toMatchObject({ reloadMilesMedian: 92.5, grade: "fair" });
    expect(map.get("GA")?.deliveries).toBeLessThan(IN_STRONG_MIN);
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
    // idle: 1, 2, 2, 2 — the last load you've run has no next and no idle
    expect(row("VA").in.idleDaysAvg).toBeCloseTo(1.75, 5);
  });

  it("sorts by OUT $/mi among 2+ load markets, then the rest by deliveries", () => {
    expect(rows.map((r) => r.state)).toEqual(["SC", "OH", "VA", "AZ"]);
  });

  it("grades OUT with the Load Scorer's own rule (thin under two loads)", () => {
    expect(row("AZ").out.grade).toBe("thin");
    expect(row("SC").out.grade).not.toBe("thin");
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

// The yardstick a market's reload is graded against is YOUR median reload over
// the WHOLE sequence — every delivered load, all time — never the window's own
// slice. Two windows, one median: OH's numbers don't move between them, so
// OH's grade must not either.
describe("the IN grade's yardstick is the whole sequence, not the window", () => {
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
    buildLedger(ERAS, win, NOW, "state").find((r) => r.state === "OH")!;

  it("takes the median off every logged reload, all time", () => {
    // 60, 70, 80, 90, 400, 420, 440, 460 → 245 mi. The recent window alone
    // would say 75, which would re-grade OH against itself.
    expect(reloadYardstick(sequenceLoads(ERAS))).toBeCloseTo(245, 5);
  });

  it("keeps OH's own numbers identical across 12m, ytd and all", () => {
    for (const win of ["12m", "ytd", "all"] as const) {
      expect(ohio(win).in.deliveries).toBe(4);
      expect(ohio(win).in.reloadMilesMedian).toBeCloseTo(75, 5);
      expect(ohio(win).in.idleDaysAvg).toBeCloseTo(2, 5);
    }
  });

  it("so OH keeps ONE grade across the three windows", () => {
    // 75 mi is 31 % of your 245-mi median — cheap to leave, on four
    // deliveries, two idle days. Strong, and strong in every window.
    expect(ohio("12m").in.grade).toBe("strong");
    expect(ohio("ytd").in.grade).toBe("strong");
    expect(ohio("all").in.grade).toBe("strong");
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

  it("crowns the best market to load, and the easiest / costliest to leave", () => {
    expect(head.bestOut?.state).toBe("SC");
    expect(head.easiestIn?.state).toBe("VA");
    expect(head.costliestIn?.state).toBe("VA");
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
