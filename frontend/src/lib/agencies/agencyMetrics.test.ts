import { describe, it, expect } from "vitest";
import type { Agency } from "@/types/agency";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import type { MeaningfulContactLike } from "@/lib/relationships/meaningfulContact";
import {
  agencyBand,
  agencyRange,
  agencyReport,
  agencyRollup,
  codeTrail,
  deliveredInWindow,
  settlementOnlyShelf,
  type SettlementOnlyRow,
} from "./agencyMetrics";

// The clock every case computes against — injected, so nothing here rots as
// the calendar advances.
const NOW = new Date("2026-09-13T15:00:00Z");

const agency = (agency_id: string, agency_code: string, over: Partial<Agency> = {}): Agency => ({
  agency_id,
  user_id: "u1",
  agency_code,
  name: null,
  posting_codes: [agency_code],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

const agent = (agent_id: string, over: Partial<Agent> = {}): Agent => ({
  agent_id,
  agency_id: null,
  agency_code: null,
  agency_name: null,
  posting_code: null,
  first_name: "First",
  last_name: agent_id,
  preferred_contact: null,
  relationship_tier: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

// A delivered load: gross via linehaul + FSC, miles explicit.
const load = (load_id: string, over: Partial<Load> = {}): Load => ({
  load_id,
  load_number: load_id,
  load_type: "flatbed",
  load_status: "delivered",
  agency_id: null,
  agency_code: null,
  posting_code: null,
  agent_id: "a1",
  agent: "First a1",
  agent_email: null,
  pickup_date: "2026-08-01",
  delivery_date: "2026-08-03",
  origin_market_id: "m1",
  origin_city: "Vicksburg",
  origin_state: "MS",
  origin_market: "Vicksburg, MS",
  destination_market_id: "m2",
  destination_city: "Dallas",
  destination_state: "TX",
  delivery_market: "Dallas, TX",
  deadhead_miles: 100,
  loaded_miles: 900,
  linehaul: "5000",
  fuel_surcharge: "1000",
  total_accessorials: "0",
  commodity: null,
  payment_status: "pending",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-03T00:00:00Z",
  ...over,
});

const LADDER: RateLadder = { walkAway: 4.0, minimum: 5.0, target: 6.0, strong: 7.0 };

describe("agencyRange — the window", () => {
  it("12 months is the trailing 365 days, both ends inclusive", () => {
    const r = agencyRange("12m", NOW);
    expect(r.toKey).toBe("2026-09-13");
    expect(r.fromKey).toBe("2025-09-13");
    expect(r.label).toBe("12 months");
    // The RecapRange half: end is exclusive, so today's freight is inside it.
    expect(r.end.toISOString().slice(0, 10)).toBe("2026-09-14");
  });

  it("90 days is 90 days; all time floors at the epoch", () => {
    expect(agencyRange("90d", NOW).fromKey).toBe("2026-06-15");
    expect(agencyRange("all", NOW).fromKey).toBe("1970-01-01");
    expect(agencyRange("all", NOW).label).toBe("All time");
  });

  // The two days the window's arithmetic is decided on. Both ends are
  // INCLUSIVE, so a load picked up on the floor is inside it and the day
  // before is not — the off-by-one that would quietly move a load's earnings
  // out of the book it belongs to.
  it("both edges are inclusive — on the floor is in, the day before is out", () => {
    const { fromKey, toKey } = agencyRange("12m", NOW);
    const onFloor = load("floor", { agency_id: "ag1", pickup_date: fromKey, delivery_date: "2025-09-15" });
    const dayBefore = load("before", {
      agency_id: "ag1",
      pickup_date: "2025-09-12",
      delivery_date: "2025-09-14",
    });
    const onToday = load("today", { agency_id: "ag1", pickup_date: toKey, delivery_date: null });

    const rows = agencyRollup(
      [agency("ag1", "CPL")],
      [],
      [onFloor, dayBefore, onToday],
      [],
      LADDER,
      "12m",
      NOW,
    );
    expect(fromKey).toBe("2025-09-13");
    expect(toKey).toBe("2026-09-13");
    // Two of the three are inside: the floor day and today. Sep 12 is not.
    expect(rows[0].delivered).toBe(2);
    expect(deliveredInWindow([onFloor, dayBefore, onToday], agencyRange("12m", NOW)).map((l) => l.load_id)).toEqual([
      "floor",
      "today",
    ]);
  });
});

describe("agencyBand — the ladder word", () => {
  it("names each step in the nod sheet's words", () => {
    expect(agencyBand(7.5, LADDER)).toBe("above Strong");
    expect(agencyBand(6.6, LADDER)).toBe("above Target");
    expect(agencyBand(5.1, LADDER)).toBe("above Minimum");
    expect(agencyBand(4.66, LADDER)).toBe("under Minimum");
    expect(agencyBand(3.2, LADDER)).toBe("losing money");
  });

  it("sits ON a step, not below it", () => {
    expect(agencyBand(7.0, LADDER)).toBe("above Strong");
    expect(agencyBand(6.0, LADDER)).toBe("above Target");
    expect(agencyBand(5.0, LADDER)).toBe("above Minimum");
    expect(agencyBand(4.0, LADDER)).toBe("under Minimum");
  });

  it("no ladder, no RPM, or a half-built ladder → no verdict at all", () => {
    expect(agencyBand(6.6, null)).toBeNull();
    expect(agencyBand(null, LADDER)).toBeNull();
    expect(agencyBand(6.6, { walkAway: null, minimum: null, target: null, strong: null })).toBeNull();
    // Strong missing is survivable — the top step just folds into "above Target".
    expect(agencyBand(9, { ...LADDER, strong: null })).toBe("above Target");
  });
});

describe("agencyRollup", () => {
  it("an empty book rolls up to nothing — no rows, no throw", () => {
    expect(agencyRollup([], [], [], [], LADDER, "12m", NOW)).toEqual([]);
  });

  it("an agency with no loads shows zeros and withholds every grade", () => {
    const rows = agencyRollup([agency("ag1", "CPL")], [], [], [], LADDER, "12m", NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].delivered).toBe(0);
    expect(rows[0].gross).toBe(0);
    // No miles is not a dollar a mile, and no RPM is not a grade.
    expect(rows[0].allInRpm).toBeNull();
    expect(rows[0].band).toBeNull();
    expect(rows[0].lastLoad).toBeNull();
    expect(rows[0].daysSinceLoad).toBeNull();
    expect(rows[0].agents).toEqual([]);
    expect(rows[0].tieredCount).toBe(0);
  });

  it("no ladder → band null, even with a real RPM", () => {
    const rows = agencyRollup(
      [agency("ag1", "CPL")],
      [],
      [load("l1", { agency_id: "ag1" })],
      [],
      null,
      "12m",
      NOW,
    );
    expect(rows[0].allInRpm).toBeCloseTo(6, 5);
    expect(rows[0].band).toBeNull();
  });

  it("a load counts for the agency on the LOAD — a person who moved desks leaves history behind", () => {
    // Drew booked l1 at CPL; he now works for Momentum. The load stays CPL's.
    const drew = agent("drew", { agency_id: "mom" });
    const rows = agencyRollup(
      [agency("cpl", "CPL"), agency("mom", "JVL")],
      [drew],
      [load("l1", { agency_id: "cpl", agent_id: "drew" })],
      [],
      LADDER,
      "12m",
      NOW,
    );
    const cpl = rows.find((r) => r.agency.agency_code === "CPL")!;
    const mom = rows.find((r) => r.agency.agency_code === "JVL")!;
    expect(cpl.delivered).toBe(1);
    expect(cpl.gross).toBe(6000);
    expect(mom.delivered).toBe(0);
    // The PERSON keeps the load on his own record wherever he sits today.
    expect(mom.agents[0].delivered).toBe(1);
    expect(cpl.agents).toEqual([]);
  });

  it("weights the RPM by miles across two agents, not by averaging their rates", () => {
    // 900+100 mi at $6,000 ($6.00/mi) and 400+100 mi at $4,000 ($8.00/mi).
    // Weighted: 10,000 ÷ 1,500 = $6.67 — a plain average of the two would say $7.00.
    const rows = agencyRollup(
      [agency("ag1", "CPL")],
      [agent("a1", { agency_id: "ag1" }), agent("a2", { agency_id: "ag1" })],
      [
        load("l1", { agency_id: "ag1", agent_id: "a1" }),
        load("l2", {
          agency_id: "ag1",
          agent_id: "a2",
          loaded_miles: 400,
          deadhead_miles: 100,
          linehaul: "3500",
          fuel_surcharge: "500",
        }),
      ],
      [],
      LADDER,
      "12m",
      NOW,
    );
    expect(rows[0].allInRpm).toBeCloseTo(10000 / 1500, 5);
    expect(rows[0].gross).toBe(10000);
    expect(rows[0].delivered).toBe(2);
    expect(rows[0].partialRpm).toBe(false);
  });

  it("a load with no deadhead logged counts loaded miles only and marks the row partial", () => {
    const rows = agencyRollup(
      [agency("ag1", "CPL")],
      [],
      [load("l1", { agency_id: "ag1", deadhead_miles: null as unknown as number })],
      [],
      LADDER,
      "12m",
      NOW,
    );
    expect(rows[0].partialRpm).toBe(true);
    expect(rows[0].allInRpm).toBeCloseTo(6000 / 900, 5);
  });

  it("the window filters the agency's freight — and never hides the last load", () => {
    const old = load("old", { agency_id: "ag1", pickup_date: "2026-02-01", delivery_date: "2026-02-03" });
    const recent = load("new", { agency_id: "ag1", pickup_date: "2026-09-01", delivery_date: "2026-09-03" });
    const twelve = agencyRollup([agency("ag1", "CPL")], [], [old, recent], [], LADDER, "12m", NOW);
    const ninety = agencyRollup([agency("ag1", "CPL")], [], [old, recent], [], LADDER, "90d", NOW);
    const all = agencyRollup([agency("ag1", "CPL")], [], [old, recent], [], LADDER, "all", NOW);
    expect(twelve[0].delivered).toBe(2);
    expect(ninety[0].delivered).toBe(1);
    expect(all[0].delivered).toBe(2);
    // "last load" reads the whole book, whatever window is showing.
    expect(ninety[0].lastLoad).toBe("2026-09-01");
    expect(ninety[0].daysSinceLoad).toBe(12);
  });

  it("a load booked for next week is freight happening now, not negative days", () => {
    const rows = agencyRollup(
      [agency("ag1", "CPL")],
      [],
      [load("l1", { agency_id: "ag1", load_status: "booked", pickup_date: "2026-09-20", delivery_date: null })],
      [],
      LADDER,
      "12m",
      NOW,
    );
    expect(rows[0].lastLoad).toBe("2026-09-20");
    expect(rows[0].daysSinceLoad).toBe(0);
    // A future pickup is not a past load: seven days UNTIL it, and the row
    // says "picks up Sep 20", not "last load Sep 20 · 0d since load".
    expect(rows[0].daysUntilLoad).toBe(7);
    // Booked is not delivered — it earns nothing on the delivered line yet.
    expect(rows[0].delivered).toBe(0);
  });

  it("a pickup already behind us counts up, and today's counts neither way", () => {
    const past = agencyRollup(
      [agency("ag1", "CPL")],
      [],
      [load("l1", { agency_id: "ag1", pickup_date: "2026-09-01", delivery_date: "2026-09-03" })],
      [],
      LADDER,
      "12m",
      NOW,
    );
    expect(past[0].daysSinceLoad).toBe(12);
    expect(past[0].daysUntilLoad).toBeNull();

    // Picked up TODAY is not "ahead" — nothing to count down to.
    const today = agencyRollup(
      [agency("ag1", "CPL")],
      [],
      [load("l1", { agency_id: "ag1", load_status: "booked", pickup_date: "2026-09-13", delivery_date: null })],
      [],
      LADDER,
      "12m",
      NOW,
    );
    expect(today[0].daysSinceLoad).toBe(0);
    expect(today[0].daysUntilLoad).toBeNull();
  });

  it("cancelled freight is not a last load", () => {
    const rows = agencyRollup(
      [agency("ag1", "CPL")],
      [],
      [load("l1", { agency_id: "ag1", load_status: "cancelled", pickup_date: "2026-09-10" })],
      [],
      LADDER,
      "12m",
      NOW,
    );
    expect(rows[0].lastLoad).toBeNull();
  });

  it("keeps each person's own tier, code and numbers", () => {
    const eric = agent("eric", { agency_id: "ag1", agency_code: "CPL", posting_code: "MAM", relationship_tier: 1 });
    const rich = agent("rich", { agency_id: "ag1", agency_code: "CPL", posting_code: null });
    const contacts: MeaningfulContactLike[] = [
      { agent_id: "eric", contacted_at: "2026-09-08T14:00:00Z", direction: "outbound", method: "call", outcome: "reached" },
      // A voicemail is not two-way — it must not reset Rich's clock.
      { agent_id: "rich", contacted_at: "2026-09-12T14:00:00Z", direction: "outbound", method: "call", outcome: "voicemail" },
    ];
    const rows = agencyRollup(
      [agency("ag1", "CPL")],
      [eric, rich],
      [load("l1", { agency_id: "ag1", agent_id: "eric" })],
      contacts,
      LADDER,
      "12m",
      NOW,
    );
    const [ericRow, richRow] = rows[0].agents;
    expect(ericRow.tier).toBe(1);
    expect(ericRow.postingCode).toEqual({ code: "MAM", kind: "posting" });
    expect(ericRow.delivered).toBe(1);
    expect(ericRow.allInRpm).toBeCloseTo(6, 5);
    // The Aug 3 delivery is two-way contact too — the Sep 8 call is simply
    // later, and the latest of the two is the date.
    expect(ericRow.lastContact).toBe("2026-09-08");
    expect(ericRow.daysSinceContact).toBe(5);
    expect(richRow.postingCode).toEqual({ code: "CPL", kind: "agency" });
    expect(richRow.tier).toBeNull();
    expect(richRow.lastContact).toBeNull();
    expect(richRow.daysSinceContact).toBeNull();
    expect(rows[0].tieredCount).toBe(1);
  });

  it("counts inbound since system start, not over the window — and on the BOOKING day, not the pickup", () => {
    const rows = agencyRollup(
      [agency("ag1", "CPL")],
      [],
      [
        // Booked before the system started — no answer on file, outside every denominator.
        load("old", { agency_id: "ag1", created_at: "2026-08-01T12:00:00Z", pickup_date: "2026-09-05" }),
        load("l1", { agency_id: "ag1", created_at: "2026-09-05T14:00:00Z", pickup_date: "2026-09-09", booked_via: "agent_reached_out" }),
        // Booked yesterday for a pickup NEXT WEEK — it counts today, not when the truck rolls.
        load("l2", { agency_id: "ag1", created_at: "2026-09-12T14:00:00Z", pickup_date: "2026-09-20", booked_via: "i_reached_out" }),
      ],
      [],
      LADDER,
      "90d",
      NOW,
    );
    expect(rows[0].inbound.attributed).toBe(2);
    expect(rows[0].inbound.inbound).toBe(1);
  });

  it("sorts by gross, biggest desk first", () => {
    const rows = agencyRollup(
      [agency("small", "AAA"), agency("big", "ZZZ")],
      [],
      [
        load("l1", { agency_id: "small", linehaul: "1000", fuel_surcharge: "0" }),
        load("l2", { agency_id: "big", linehaul: "9000", fuel_surcharge: "0" }),
      ],
      [],
      LADDER,
      "12m",
      NOW,
    );
    expect(rows.map((r) => r.agency.agency_code)).toEqual(["ZZZ", "AAA"]);
  });
});

describe("codeTrail — settlements vs dash", () => {
  const cpl = agency("ag1", "CPL", { posting_codes: ["CPL", "MAM", "CJY"] });

  it("nothing to reconcile when every load posts a code the agency owns", () => {
    const trail = codeTrail(cpl, [
      load("l1", { posting_code: "MAM" }),
      load("l2", { posting_code: "CPL" }),
      load("l3", { posting_code: "CJY" }),
    ]);
    expect(trail.matched).toBe(3);
    expect(trail.unmatched).toEqual([]);
    expect(trail.uncoded).toBe(0);
  });

  it("flags a load posted under a foreign code, newest first", () => {
    const trail = codeTrail(cpl, [
      load("l1", { posting_code: "MAM" }),
      load("l2", { posting_code: "SUH", pickup_date: "2026-03-01" }),
      load("l3", { posting_code: "JXO", pickup_date: "2026-07-01" }),
    ]);
    expect(trail.matched).toBe(1);
    expect(trail.unmatched.map((u) => u.postingCode)).toEqual(["JXO", "SUH"]);
    expect(trail.unmatched[0].load.load_id).toBe("l3");
  });

  it("a load the settlements have not spoken for is neither matched nor a mismatch", () => {
    const trail = codeTrail(cpl, [load("l1", { posting_code: null }), load("l2", { posting_code: "  " })]);
    expect(trail.matched).toBe(0);
    expect(trail.unmatched).toEqual([]);
    expect(trail.uncoded).toBe(2);
  });

  it("an empty book, and an agency with no codes at all", () => {
    expect(codeTrail(cpl, [])).toEqual({ matched: 0, unmatched: [], uncoded: 0 });
    expect(codeTrail(null, [load("l1", { posting_code: "MAM" })])).toEqual({
      matched: 0,
      unmatched: [{ load: expect.objectContaining({ load_id: "l1" }), postingCode: "MAM" }],
      uncoded: 0,
    });
  });

  // posting_codes is evidence the settlement feed appends to, and a feed can
  // append junk: a blank string, a padded code, a null the array type allows.
  // Blanks must never become an owned code (every uncoded load would then
  // "match"), and a padded one must still match the code it names.
  it("blank entries inside posting_codes own nothing; a padded one still matches", () => {
    const messy = agency("ag2", "CPL", {
      posting_codes: ["CPL", "", "   ", null as unknown as string, " MAM "],
    });
    const trail = codeTrail(messy, [
      load("l1", { posting_code: "MAM" }),
      load("l2", { posting_code: null }),
      load("l3", { posting_code: "SUH" }),
    ]);
    expect(trail.matched).toBe(1);
    expect(trail.uncoded).toBe(1);
    expect(trail.unmatched.map((u) => u.postingCode)).toEqual(["SUH"]);
  });
});

describe("settlementOnlyShelf", () => {
  const rows: SettlementOnlyRow[] = [
    // numeric columns arrive as STRINGS
    { agent_code: "DLJ", load_number: "9001", first_period: "2026-02-14", revenue: "1200.50", agency_id: null },
    { agent_code: "DLJ", load_number: "9002", first_period: "2026-01-31", revenue: "800.00", agency_id: null },
    { agent_code: "DLJ", load_number: "9003", first_period: "2026-03-07", revenue: "1000.00", agency_id: null },
    { agent_code: "ABL", load_number: "9100", first_period: "2026-05-02", revenue: "2000.00", agency_id: "ag-abl" },
    { agent_code: "LHT", load_number: "9200", first_period: "2026-06-06", revenue: "1500.00", agency_id: null },
  ];
  const agencies = [
    agency("ag-abl", "ABL", { name: "Gary Crites DBA" }),
    agency("ag-lht", "LHT", { name: "LHT Agency" }),
  ];

  it("groups by code, sums the money and keeps the earliest statement", () => {
    const shelf = settlementOnlyShelf(rows, agencies);
    expect(shelf.map((s) => s.code)).toEqual(["DLJ", "ABL", "LHT"]);
    expect(shelf[0]).toMatchObject({ code: "DLJ", loads: 3, revenue: 3000.5, firstPeriod: "2026-01-31", agency: null });
  });

  it("finds the agency by id, and by code when the join came back empty", () => {
    const shelf = settlementOnlyShelf(rows, agencies);
    expect(shelf.find((s) => s.code === "ABL")!.agency!.name).toBe("Gary Crites DBA");
    // LHT carried no agency_id; the code still names it.
    expect(shelf.find((s) => s.code === "LHT")!.agency!.name).toBe("LHT Agency");
  });

  it("sorts most loads first", () => {
    expect(settlementOnlyShelf(rows, agencies).map((s) => s.loads)).toEqual([3, 1, 1]);
  });

  it("counts a load once however many lines paid it", () => {
    const twice: SettlementOnlyRow[] = [
      { agent_code: "DLJ", load_number: "9001", first_period: "2026-02-14", revenue: "1000", agency_id: null },
      { agent_code: "DLJ", load_number: "9001", first_period: "2026-02-21", revenue: "200", agency_id: null },
    ];
    const shelf = settlementOnlyShelf(twice, []);
    expect(shelf[0].loads).toBe(1);
    expect(shelf[0].revenue).toBe(1200);
  });

  it("nothing on file → an empty shelf", () => {
    expect(settlementOnlyShelf([], agencies)).toEqual([]);
    expect(settlementOnlyShelf([], [])).toEqual([]);
  });

  // THE bug this shelf exists to avoid. MAM is Eric's desk INSIDE Central
  // Pennsylvania: it is in the agency's posting_codes and it is not the
  // agency's own code. Resolving by agency_code alone called MAM unknown, and
  // its row then offered a `+` that would create a SECOND agency for a desk
  // Central Pennsylvania already owns.
  it("resolves a code that is in posting_codes but is not the agency code", () => {
    const cpl = agency("ag-cpl", "CPL", {
      name: "Central Pennsylvania Logistics Inc",
      posting_codes: ["CPL", "MAM", "CJY"],
    });
    const shelf = settlementOnlyShelf(
      [
        // The server's join came back empty (agency_id null) — the client
        // fallback has to reach the same answer on its own.
        { agent_code: "MAM", load_number: "8336008", first_period: "2026-04-04", revenue: "3200.00", agency_id: null },
      ],
      [cpl],
    );
    expect(shelf).toHaveLength(1);
    expect(shelf[0].agency?.agency_id).toBe("ag-cpl");
    expect(shelf[0].agency?.name).toBe("Central Pennsylvania Logistics Inc");
  });

  it("a code nobody owns stays unknown — that row is the one that gets the +", () => {
    const cpl = agency("ag-cpl", "CPL", { posting_codes: ["CPL", "MAM", "CJY"] });
    const shelf = settlementOnlyShelf(
      [{ agent_code: "DLJ", load_number: "9001", first_period: "2026-02-14", revenue: "1200", agency_id: null }],
      [cpl],
    );
    expect(shelf[0].agency).toBeNull();
  });

  it("the agency that OWNS the code wins over one that merely posted under it", () => {
    // A load filed under the wrong agency leaves SUH in Central Pennsylvania's
    // evidence too — the code trail's whole subject. It still belongs to
    // Momentum, whose own code it is.
    const cpl = agency("ag-cpl", "CPL", { name: "Central Pennsylvania", posting_codes: ["CPL", "SUH"] });
    const momentum = agency("ag-mom", "SUH", { name: "Momentum Transportation", posting_codes: ["SUH", "JXO"] });
    const shelf = settlementOnlyShelf(
      [{ agent_code: "SUH", load_number: "9300", first_period: "2026-07-04", revenue: "900", agency_id: null }],
      [cpl, momentum],
    );
    expect(shelf[0].agency?.agency_id).toBe("ag-mom");
  });

  it("a blank code is not a row; a missing amount is $0 and keeps the load", () => {
    const messy: SettlementOnlyRow[] = [
      { agent_code: "   ", load_number: "9400", first_period: "2026-04-04", revenue: "500", agency_id: null },
      { agent_code: "", load_number: "9401", first_period: "2026-04-04", revenue: "500", agency_id: null },
      // A settlement line whose amount never arrived. The LOAD is the fact
      // here — the row stays, contributing nothing to the money.
      { agent_code: "DLJ", load_number: "9500", first_period: "2026-04-04", revenue: null as unknown as string, agency_id: null },
      { agent_code: "DLJ", load_number: "9501", first_period: "2026-04-11", revenue: "not a number", agency_id: null },
      { agent_code: "DLJ", load_number: "9502", first_period: "2026-04-18", revenue: "250.25", agency_id: null },
    ];
    const shelf = settlementOnlyShelf(messy, []);
    expect(shelf.map((s) => s.code)).toEqual(["DLJ"]);
    expect(shelf[0].loads).toBe(3);
    expect(shelf[0].revenue).toBeCloseTo(250.25, 5);
    expect(shelf[0].firstPeriod).toBe("2026-04-04");
  });
});

describe("agencyReport", () => {
  it("prints the window, a line per agency that ran, then the shelf", () => {
    const rollup = agencyRollup(
      [agency("ag1", "CPL", { name: "Central Pennsylvania Logistics Inc" }), agency("ag2", "ZZZ")],
      [agent("eric", { agency_id: "ag1", relationship_tier: 1 })],
      [load("l1", { agency_id: "ag1", agent_id: "eric" })],
      [],
      LADDER,
      "12m",
      NOW,
    );
    const shelf = settlementOnlyShelf(
      [{ agent_code: "DLJ", load_number: "9001", first_period: "2026-02-14", revenue: "1200", agency_id: null }],
      [],
    );
    const text = agencyReport(rollup, shelf, "12 months", "2026-01-01", NOW);
    expect(text).toContain("AGENCIES · 12 months · as of 2026-09-13");
    expect(text).toContain(
      "Central Pennsylvania Logistics Inc · CPL · 1 load · $6,000 · $6.00 all-in · above Target · 1 agent (1 tiered)",
    );
    // The agency that delivered nothing is left out rather than printed as zeros.
    expect(text).not.toContain("ZZZ");
    expect(text).toContain("SETTLEMENT-ONLY · 2026 · 1 code · 1 load");
    expect(text).toContain("DLJ · no agency on file · 1 load · $1,200 · first paid 2026-02-14");
    expect(text).toContain("These never enter the ladder, the tiers or the Foreman.");
  });

  it("says so plainly when nothing delivered and nothing is owed", () => {
    const text = agencyReport([], [], "90 days", null, NOW);
    expect(text).toContain("No delivered freight in this window.");
    expect(text).not.toContain("SETTLEMENT-ONLY");
  });

  // An agency nobody has named IS its code. Printing "CPL · CPL" reads like a
  // bug in the report rather than a desk waiting on a freight bill.
  it("an unnamed agency that ran prints its code once", () => {
    const rollup = agencyRollup(
      [agency("ag1", "LHT")],
      [],
      [load("l1", { agency_id: "ag1" })],
      [],
      LADDER,
      "12m",
      NOW,
    );
    const line = agencyReport(rollup, [], "12 months", null, NOW)
      .split("\n")
      .find((l) => l.startsWith("LHT"))!;
    expect(line).toBe("LHT · 1 load · $6,000 · $6.00 all-in · above Target · 0 agents");
    expect(line).not.toContain("LHT · LHT");
  });

  // Rows but an EMPTY shelf: no SETTLEMENT-ONLY block at all, and no closing
  // "These never enter the ladder" sentence about rows that do not exist.
  it("rows with an empty shelf print no settlement-only block — and the footnote when a row is partial", () => {
    const rollup = agencyRollup(
      [agency("ag1", "CPL", { name: "Central Pennsylvania Logistics Inc" })],
      [],
      [load("l1", { agency_id: "ag1", deadhead_miles: null as unknown as number })],
      [],
      LADDER,
      "12m",
      NOW,
    );
    const text = agencyReport(rollup, [], "12 months", "2026-01-01", NOW);
    expect(text).not.toContain("SETTLEMENT-ONLY");
    expect(text).not.toContain("These never enter the ladder");
    // The star on the rate, and the sentence that explains it.
    expect(text).toContain("$6.67* all-in");
    expect(text).toContain("* a load with no deadhead logged counted loaded miles only.");
  });

  it("no footnote when every rate is whole", () => {
    const rollup = agencyRollup(
      [agency("ag1", "CPL", { name: "Central Pennsylvania Logistics Inc" })],
      [],
      [load("l1", { agency_id: "ag1" })],
      [],
      LADDER,
      "12m",
      NOW,
    );
    expect(agencyReport(rollup, [], "12 months", null, NOW)).not.toContain("no deadhead logged");
  });

  it("an unnamed agency on the shelf prints its code once too", () => {
    const shelf = settlementOnlyShelf(
      [{ agent_code: "ABL", load_number: "9100", first_period: "2026-05-02", revenue: "2000", agency_id: "ag-abl" }],
      [agency("ag-abl", "ABL")], // on file, still unnamed
    );
    const text = agencyReport([], shelf, "12 months", "2026-01-01", NOW);
    expect(text).toContain("ABL · 1 load · $2,000 · first paid 2026-05-02");
    expect(text).not.toContain("ABL · ABL");
    expect(text).not.toContain("no agency on file");
  });
});
