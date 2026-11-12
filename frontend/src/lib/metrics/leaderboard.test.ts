import { describe, it, expect } from "vitest";
import type { Agency } from "@/types/agency";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import { buildLeaderboard, sortBy, order, bestByClass, GRADE_WORD } from "./leaderboard";

const NOW = new Date("2026-09-13T15:00:00Z");
const LADDER: RateLadder = { breakEven: 3.0, minimum: 3.3, target: 3.6, prime: 4.0 };

const agency = (id: string, code: string, name: string | null = null): Agency => ({
  agency_id: id,
  user_id: "u",
  agency_code: code,
  name,
  posting_codes: [code],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const agent = (id: string, agency_id: string | null, over: Partial<Agent> = {}): Agent => ({
  agent_id: id,
  agency_id,
  agency_code: null,
  agency_name: null,
  posting_code: null,
  first_name: "F",
  last_name: id.toUpperCase(),
  preferred_contact: null,
  relationship_tier: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

// gross = linehaul; miles explicit. $/mi = gross / (loaded + deadhead).
const load = (id: string, agency_id: string | null, agent_id: string, gross: number, miles: number, over: Partial<Load> = {}): Load =>
  ({
    load_id: id,
    load_number: id,
    load_type: "flatbed",
    load_status: "delivered",
    agency_id,
    agency_code: null,
    posting_code: null,
    agent_id,
    pickup_date: "2026-08-01",
    delivery_date: "2026-08-03",
    deadhead_miles: 0,
    loaded_miles: miles,
    linehaul: String(gross),
    fuel_surcharge: "0",
    total_accessorials: "0",
    ...over,
  }) as unknown as Load;

const many = (prefix: string, n: number, ag: string | null, who: string, gross: number, miles: number, over: Partial<Load> = {}) =>
  Array.from({ length: n }, (_, i) => load(`${prefix}${i}`, ag, who, gross, miles, over));

const book = (specialB = false) => {
  const agencies = [agency("A", "AAA", "Alpha"), agency("B", "BBB", "Bravo"), agency("C", "CCC", "Charlie"), agency("D", "DDD", "Delta")];
  const agents = [agent("a1", "A"), agent("b1", "B"), agent("c1", "C"), agent("d1", "D")];
  const loads = [
    ...many("a", 3, "A", "a1", 4200, 1000), // 4.20 prime, 3 loads
    ...many("b", 3, "B", "b1", 3100, 1000, specialB ? { load_type: "hazmat" } : {}), // 3.10 at the floor
    ...many("c", 2, "C", "c1", 2000, 1000), // 2.00 below cost, only 2 loads
    ...many("d", 3, "D", "d1", 1000, 0, { loaded_miles: 0 }), // no miles logged
  ];
  return { agencies, agents, loads };
};

const build = (b = book()) =>
  buildLeaderboard({ ...b, contacts: [], ladder: LADDER, now: NOW });

describe("buildLeaderboard", () => {
  const lb = build();
  const by = (name: string) => lb.rows.find((r) => r.name === name)!;

  it("orders graded desks by rate (null last), then the ungraded", () => {
    expect(lb.rows.map((r) => r.name)).toEqual(["Alpha", "Bravo", "Delta", "Charlie"]);
  });

  it("grades only at three delivered loads, in the ladder's words", () => {
    expect(by("Alpha").graded).toBe(true);
    expect(by("Alpha").gradeWord).toBe("PRIME");
    expect(by("Bravo").gradeWord).toBe("ABOVE MINIMUM");
    expect(by("Charlie").graded).toBe(false);
    expect(by("Charlie").grade).toBeNull();
    expect(by("Charlie").gradeWord).toBe("");
    expect(by("Charlie").allInRpm).toBeCloseTo(2.0, 5); // a rate, but no verdict yet
    expect(GRADE_WORD.below).toBe("BELOW COST");
    expect(GRADE_WORD.target).toBe("TARGET");
  });

  it("a desk with no miles has a null rate, never $0, and no grade", () => {
    const d = by("Delta");
    expect(d.allInRpm).toBeNull();
    expect(d.loadedShare).toBeNull();
    expect(d.grade).toBeNull();
  });

  it("shares sum to 1 over the attributed loads", () => {
    expect(lb.rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 10);
    expect(lb.unattributed).toEqual({ loads: 0, gross: 0 });
  });

  it("totals read the same window", () => {
    expect(lb.totals.loads).toBe(11);
    expect(lb.totals.desks).toBe(4);
    expect(lb.totals.agents).toBe(4);
    expect(lb.totals.top3Share).toBeCloseTo((12600 + 9300 + 4000) / (12600 + 9300 + 4000 + 3000), 6);
  });

  it("builds a desk from the posting code for an agent with no agency, and counts code-less loads apart", () => {
    const b = book();
    b.agents.push(agent("z1", null, { posting_code: "ZZZ", last_name: "Zed" }));
    b.loads.push(...many("z", 3, null, "z1", 3700, 1000));
    b.loads.push(load("orphan", null, "", 500, 100));
    const out = build(b);
    const z = out.rows.find((r) => r.name === "ZZZ")!;
    expect(z.loads).toBe(3);
    expect(z.codes).toEqual(["ZZZ"]);
    expect(z.people).toBe("Zed");
    expect(z.allInRpm).toBeCloseTo(3.7, 5);
    expect(z.gradeWord).toBe("TARGET");
    expect(out.unattributed).toEqual({ loads: 1, gross: 500 });
    expect(out.rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 10);
  });

  it("counts detention owed and collected over the window", () => {
    const b = book();
    b.loads[0] = { ...b.loads[0], detention_billable: true, detention_paid: true };
    b.loads[1] = { ...b.loads[1], detention_billable: true, detention_paid: false };
    expect(build(b).rows.find((r) => r.name === "Alpha")!.detention).toEqual({ owed: 1, paid: 1 });
  });

  it("rating: the agency's, else the people's joined", () => {
    const b = book();
    b.agents[0] = { ...b.agents[0], rating: 4 };
    b.agents.push(agent("a2", "A", { rating: 3 }));
    expect(build(b).rows.find((r) => r.name === "Alpha")!.rating).toBe("4 · 3");
    b.agencies[0] = { ...b.agencies[0], rating: 5 };
    expect(build(b).rows.find((r) => r.name === "Alpha")!.rating).toBe("5");
  });
});

describe("sortBy / order", () => {
  const lb = build();
  it("sorts by a column, blanks last", () => {
    expect(sortBy(lb.rows, "loads")[0].loads).toBe(3);
    expect(sortBy(lb.rows, "gross").map((r) => r.name)[0]).toBe("Alpha");
    const byRate = sortBy(lb.rows, "rate").map((r) => r.name);
    expect(byRate[byRate.length - 1]).toBe("Delta");
    expect(order(lb.rows).map((r) => r.name)).toEqual(lb.rows.map((r) => r.name));
  });
});

describe("bestByClass", () => {
  it("names the best graded desk per class, and null where nobody has three", () => {
    const a = build();
    expect(a.best.Standard?.desk.name).toBe("Alpha");
    expect(a.best.Specialized).toBeNull();
    const b = build(book(true));
    expect(b.best.Specialized?.desk.name).toBe("Bravo");
    expect(b.best.Specialized?.rpm).toBeCloseTo(3.1, 5);
    expect(b.best.Specialized?.loads).toBe(3);
    expect(bestByClass(b.rows).Standard?.desk.name).toBe("Alpha");
  });

  it("measures a desk over that class's loads only", () => {
    const b = book(true);
    // Alpha adds three pricey hazmat loads: Specialized goes to Alpha at 5.0.
    b.loads.push(...many("ah", 3, "A", "a1", 5000, 1000, { load_type: "hazmat" }));
    const out = build(b);
    expect(out.best.Specialized?.desk.name).toBe("Alpha");
    expect(out.best.Specialized?.rpm).toBeCloseTo(5, 5);
    expect(out.best.Standard?.rpm).toBeCloseTo(4.2, 5);
  });
});
