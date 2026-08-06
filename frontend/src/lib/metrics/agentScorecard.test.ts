import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Load } from "@/types/load";
import type { Agent } from "@/types/agent";
import {
  classifySpecialty,
  buildAgentScorecards,
  agentRosterAnalytics,
} from "./agentScorecard";

const load = (over: Partial<Load>): Load =>
  ({
    load_id: "L",
    load_status: "delivered",
    load_type: "standard flatbed",
    agent_id: "a",
    delivery_date: "2026-07-15",
    loaded_miles: 1000,
    linehaul: "2000",
    fuel_surcharge: "0",
    total_accessorials: "0",
    detention_billable: null,
    detention_paid: false,
    ...over,
  }) as Load;

const agent = (id: string, rating: number | null): Agent =>
  ({ agent_id: id, rating, first_name: id, last_name: "X", broker_name: "B" }) as Agent;

describe("classifySpecialty", () => {
  it("labels oversize when oversize/heavy-haul is the majority (2+)", () => {
    const m = classifySpecialty([
      load({ load_type: "oversize" }),
      load({ load_type: "heavy haul" }),
      load({ load_type: "standard flatbed" }),
    ]);
    expect(m.tag).toBe("oversize");
    expect(m.oversizeShare).toBeCloseTo(2 / 3, 5);
    expect(m.oversizeCount).toBe(2);
  });

  it("labels specialty for a non-standard (hazmat) majority that isn't oversize", () => {
    const m = classifySpecialty([load({ load_type: "hazmat" }), load({ load_type: "hazmat" })]);
    expect(m.tag).toBe("specialty");
    expect(m.oversizeShare).toBe(0);
  });

  it("stays standard for a single oversize load (count < 2 → don't crown)", () => {
    expect(classifySpecialty([load({ load_type: "oversize" })]).tag).toBe("standard");
  });

  it("standard when standard flatbed dominates", () => {
    expect(classifySpecialty([load({}), load({}), load({ load_type: "oversize" })]).tag).toBe(
      "standard",
    );
  });
});

describe("buildAgentScorecards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  // Three oversize agents at distinct $/mi so the cohort (3) can be graded.
  const rpmLoads = (id: string, rpm: number, n: number, date = "2026-07-20"): Load[] =>
    Array.from({ length: n }, () =>
      load({ agent_id: id, load_type: "oversize", linehaul: String(rpm * 1000), delivery_date: date }),
    );

  it("computes rate/volume and grades rate within the specialty cohort → tiers", () => {
    const agents = [agent("hi", 3), agent("mid", 3), agent("lo", 4)];
    const loads = [...rpmLoads("hi", 10, 3), ...rpmLoads("mid", 6, 3), ...rpmLoads("lo", 3, 3)];
    const cards = buildAgentScorecards(agents, loads);

    expect(cards.get("hi")!.medianRpm).toBeCloseTo(10, 5);
    expect(cards.get("hi")!.revenue).toBe(30000); // 3 × $10k gross
    expect(cards.get("hi")!.tier).toBe("call-first"); // top of the oversize cohort
    expect(cards.get("mid")!.tier).toBe("solid"); // middle
    expect(cards.get("lo")!.tier).toBe("watch"); // weakest rate in cohort
  });

  it("money-lost detention = CONFIRMED billable + unpaid; unconfirmed (oversize priced-in) never counts", () => {
    const loads = [
      ...rpmLoads("x", 8, 2),
      load({ agent_id: "x", load_type: "oversize", detention_billable: true, detention_paid: false }), // money lost
      load({ agent_id: "x", load_type: "oversize", detention_billable: true, detention_paid: true }), // collected
      load({ agent_id: "x", load_type: "oversize", detention_billable: null, detention_paid: false }), // sat, not confirmed → ignored
    ];
    const c = buildAgentScorecards([agent("x", 3)], loads).get("x")!;
    expect(c.moneyLostLoads).toBe(1);
    expect(c.collectedLoads).toBe(1);
    expect(c.collectRate).toBeCloseTo(0.5, 5); // 1 of 2 confirmed
    expect(c.tier).toBe("watch"); // any money lost → watch, regardless of rate
  });

  it("thin data under 2 loads; cold after 90 quiet days", () => {
    const cards = buildAgentScorecards(
      [agent("thin", 5), agent("cold", 4)],
      [
        load({ agent_id: "thin" }),
        ...Array.from({ length: 3 }, () => load({ agent_id: "cold", delivery_date: "2026-03-01" })),
      ],
    );
    expect(cards.get("thin")!.tier).toBe("thin");
    expect(cards.get("cold")!.tier).toBe("cold"); // last worked ~5 months ago
    expect(cards.get("cold")!.daysSince).toBeGreaterThan(90);
  });

  it("flags gut-vs-data both ways", () => {
    // 'lo' is weakest-rate oversize → watch, but rated 4 → 'over'-rated.
    // 'under' is a solid standard agent rated 2 → 'under'-rated (the Jamie case).
    const agents = [agent("hi", 3), agent("mid", 3), agent("lo", 4), agent("under", 2)];
    const loads = [
      ...rpmLoads("hi", 10, 3),
      ...rpmLoads("mid", 6, 3),
      ...rpmLoads("lo", 3, 3),
      ...Array.from({ length: 2 }, () => load({ agent_id: "under", linehaul: "3000" })), // standard, solid
    ];
    const cards = buildAgentScorecards(agents, loads);
    expect(cards.get("lo")!.tier).toBe("watch");
    expect(cards.get("lo")!.ratingFlag).toBe("over");
    expect(cards.get("under")!.ratingFlag).toBe("under");
  });
});

describe("agentRosterAnalytics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("summarizes rate leader, oversize bench, concentration, and the best cold agent", () => {
    const agents = [agent("a", 4), agent("b", 3), agent("c", 3)];
    const loads = [
      // a: oversize specialist, biggest earner, but cold (worked in March)
      ...Array.from({ length: 3 }, () =>
        load({ agent_id: "a", load_type: "oversize", linehaul: "9000", delivery_date: "2026-03-10" }),
      ),
      // b: oversize, recent, rate leader
      ...Array.from({ length: 2 }, () =>
        load({ agent_id: "b", load_type: "oversize", linehaul: "12000", delivery_date: "2026-07-30" }),
      ),
      // c: standard, small
      ...Array.from({ length: 2 }, () => load({ agent_id: "c", linehaul: "2000", delivery_date: "2026-07-30" })),
    ];
    const r = agentRosterAnalytics(buildAgentScorecards(agents, loads));
    expect(r.rateLeader?.agentId).toBe("b");
    expect(r.rateLeader?.medianRpm).toBeCloseTo(12, 5);
    expect(r.oversizeBench).toBe(2); // a and b
    expect(r.goingCold?.agentId).toBe("a"); // the cold, high-value one
    expect(r.concentrationPct).toBeGreaterThan(0.5);
  });
});
