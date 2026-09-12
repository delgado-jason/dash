import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import { daysEmpty, fiveText, fiveWeek, fridayFive, hygiene, loadAllInRpm, type FiveContactLike } from "./fridayFive";

// Local-time clock on purpose — the reporting week is Brandie's Saturday → Friday.
const local = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h, 0, 0);
const iso = (y: number, m: number, d: number, h = 10) => local(y, m, d, h).toISOString();
const FRI = local(2026, 9, 18, 15); // Friday Sep 18 → week Sat Sep 12 – Fri Sep 18

const contact = (o: Partial<FiveContactLike> & { contacted_at: string }): FiveContactLike => ({
  agent_id: "a",
  direction: "outbound",
  method: "call",
  type: "reactivation",
  outcome: "reached",
  ...o,
});

const load = (o: Partial<Load>): Load =>
  ({
    load_id: Math.random().toString(36).slice(2),
    load_status: "delivered",
    pickup_date: "2026-09-14",
    delivery_date: "2026-09-15",
    linehaul: "3000",
    fuel_surcharge: "500",
    total_accessorials: "0",
    loaded_miles: 500,
    deadhead_miles: 100,
    created_at: iso(2026, 9, 14),
    ...o,
  }) as unknown as Load;

describe("fiveWeek — Saturday through Friday, local", () => {
  it("every day from Saturday to the next Friday keys to that Saturday", () => {
    for (let d = 12; d <= 18; d++) expect(fiveWeek(local(2026, 9, d)).startKey).toBe("2026-09-12");
    expect(fiveWeek(local(2026, 9, 12)).endKey).toBe("2026-09-18");
    expect(fiveWeek(local(2026, 9, 19)).startKey).toBe("2026-09-19");
    expect(fiveWeek(local(2026, 9, 11, 23)).startKey).toBe("2026-09-05");
  });

  it("throughKey stops at today mid-week and at Friday on Friday", () => {
    expect(fiveWeek(local(2026, 9, 15)).throughKey).toBe("2026-09-15");
    expect(fiveWeek(FRI).throughKey).toBe("2026-09-18");
  });
});

describe("fridayFive — the five numbers over the week", () => {
  it("empty in → zeros, no break-even fraction, every day empty", () => {
    const f = fridayFive([], [], 5, FRI);
    expect(f).toMatchObject({ contacted: 0, contactedUntimed: false, footprints: 0, inboundOffers: 0, aboveBreakEven: null, daysEmpty: 7 });
  });

  it("agents contacted = distinct agents reached on an outbound call this week", () => {
    const contacts = [
      contact({ contacted_at: iso(2026, 9, 14) }),
      contact({ contacted_at: iso(2026, 9, 15) }), // same agent, second reach
      contact({ agent_id: "b", contacted_at: iso(2026, 9, 16) }),
      contact({ agent_id: "c", contacted_at: iso(2026, 9, 16), outcome: "voicemail" }), // not reached
      contact({ agent_id: "d", contacted_at: iso(2026, 9, 10) }), // last week
    ];
    const f = fridayFive(contacts, [], 5, FRI);
    expect(f.contacted).toBe(2);
    expect(f.contactedUntimed).toBe(false);
  });

  it("an outbound touch with no outcome on file counts, and the number says so", () => {
    const contacts = [
      contact({ contacted_at: iso(2026, 9, 14) }),
      contact({ agent_id: "e", contacted_at: iso(2026, 9, 14), method: "email", type: "capacity", outcome: null }),
    ];
    const f = fridayFive(contacts, [], 5, FRI);
    expect(f.contacted).toBe(2);
    expect(f.contactedUntimed).toBe(true);
    // the same agent reached AND emailed without an outcome is one clean count
    const clean = fridayFive([contacts[0], { ...contacts[1], agent_id: "a" }], [], 5, FRI);
    expect(clean.contacted).toBe(1);
    expect(clean.contactedUntimed).toBe(false);
  });

  it("footprints and inbound offers count touches inside the week only", () => {
    const contacts = [
      contact({ contacted_at: iso(2026, 9, 14), footprint_captured: true }),
      contact({ contacted_at: iso(2026, 9, 9), footprint_captured: true }), // last week
      contact({ agent_id: "b", contacted_at: iso(2026, 9, 15), direction: "inbound", type: "inbound_inquiry" }),
      contact({ agent_id: "b", contacted_at: iso(2026, 9, 15), direction: "inbound", type: "other" }),
    ];
    const f = fridayFive(contacts, [], 5, FRI);
    expect(f.footprints).toBe(1);
    expect(f.inboundOffers).toBe(1);
    expect(f.contacted).toBe(1); // inbound never counts as contacted
  });

  it("above break-even = booked-this-week loads at or over the walk-away, all-in", () => {
    const loads = [
      load({ load_id: "ok" }), // 3500 / 600 = 5.83
      load({ load_id: "low", linehaul: "2000", fuel_surcharge: "0" }), // 2000 / 600 = 3.33
      load({ load_id: "nodh", deadhead_miles: null as unknown as number, linehaul: "2400", fuel_surcharge: "0" }), // 2400 / 500 = 4.8
      load({ load_id: "old", created_at: iso(2026, 9, 5) }),
      load({ load_id: "x", load_status: "cancelled" }),
    ];
    expect(fridayFive([], loads, 4.8, FRI).aboveBreakEven).toEqual({ n: 2, m: 3 });
    expect(fridayFive([], loads, null, FRI).aboveBreakEven).toBeNull(); // no ladder → no verdict
    expect(loadAllInRpm(load({ loaded_miles: 0, deadhead_miles: 0 }))).toBeNull();
  });

  it("fiveText is the plain report, with the untimed tag and the dash for no fraction", () => {
    const f = fridayFive([contact({ contacted_at: iso(2026, 9, 14), method: "email", outcome: null })], [], 5, FRI);
    expect(fiveText(f)).toBe(
      ["The five · Sat, Sep 12 – Fri, Sep 18", "Agents contacted: 1 (some untimed)", "Footprints completed: 0", "Inbound load offers: 0", "Booked above break-even: —", "Days empty: 7"].join("\n"),
    );
  });
});

describe("daysEmpty — calendar days this week with no load covering them", () => {
  const week = fiveWeek(FRI); // Sep 12 – 18, through Friday

  it("a pickup→delivery span covers its days inclusive; the rest are empty", () => {
    expect(daysEmpty([load({ pickup_date: "2026-09-14", delivery_date: "2026-09-16" })], week)).toBe(4); // 12, 13, 17, 18
  });

  it("an in-transit load with no delivery date covers through today; a cancelled load covers nothing", () => {
    expect(daysEmpty([load({ load_status: "in_transit", pickup_date: "2026-09-16", delivery_date: null })], week)).toBe(4); // 12–15 empty
    expect(daysEmpty([load({ load_status: "cancelled" })], week)).toBe(7);
  });

  it("mid-week only counts the days so far", () => {
    const w = fiveWeek(local(2026, 9, 14)); // Monday → Sat, Sun, Mon
    expect(daysEmpty([], w)).toBe(3);
    expect(daysEmpty([load({ pickup_date: "2026-09-14T05:00:00.000Z", delivery_date: "2026-09-14T05:00:00.000Z" })], w)).toBe(2);
  });
});

describe("hygiene — what the Friday afternoon fixes", () => {
  const agents = [
    { agent_id: "a", phone: "555", preferred_contact: "email" },
    { agent_id: "b", phone: null, preferred_contact: null },
    { agent_id: "c", phone: "  ", preferred_contact: "phone" },
  ];
  const loads = [{ agent_id: "a", load_status: "delivered", origin_city: "Akron", origin_state: "OH" }];
  const coverage = [{ agent_id: "c", city: "Toledo", state: "OH" }];

  it("lists the agents behind each gap and drops empty items", () => {
    const items = hygiene(agents, loads, coverage);
    expect(items.map((i) => [i.key, i.agents.map((a) => a.agent_id)])).toEqual([
      ["phone", ["b", "c"]],
      ["preferred", ["b"]],
      ["footprint", ["b"]],
    ]);
    expect(hygiene([], loads, coverage)).toEqual([]);
    expect(hygiene([agents[0]], loads, coverage)).toEqual([]);
  });
});
