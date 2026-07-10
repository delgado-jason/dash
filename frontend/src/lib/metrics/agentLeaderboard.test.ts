import { describe, it, expect } from "vitest";
import {
  quarterKey,
  computeHonors,
  perAgentStats,
  rosterKpis,
  agentPrestige,
  agentSeasonLog,
} from "./agentLeaderboard";

// Minimal delivered-load factory. Revenue = linehaul (fsc/accessorials 0).
const mk = (
  agent_id: string,
  delivery_date: string,
  linehaul: number,
  overrides: Record<string, unknown> = {},
) =>
  ({
    agent_id,
    load_status: "delivered",
    delivery_date,
    pickup_date: delivery_date,
    linehaul: String(linehaul),
    fuel_surcharge: "0",
    total_accessorials: "0",
    ...overrides,
  }) as any;

describe("quarterKey", () => {
  it("maps months to calendar quarters", () => {
    expect(quarterKey("2026-02-15")).toBe("2026-Q1");
    expect(quarterKey("2026-05-01")).toBe("2026-Q2");
    expect(quarterKey("2026-09-30")).toBe("2026-Q3");
    expect(quarterKey("2026-12-31")).toBe("2026-Q4");
  });
});

describe("computeHonors", () => {
  // Q1: A 3 loads/$30k, B 3 loads/$20k, C 2 loads/$25k, D 1 load/$9k
  // Q2: A 3 loads/$40k, B 2 loads/$15k
  const loads = [
    mk("A", "2026-02-10", 10000),
    mk("A", "2026-02-11", 10000),
    mk("A", "2026-02-12", 10000),
    mk("B", "2026-03-01", 10000),
    mk("B", "2026-03-02", 5000),
    mk("B", "2026-03-03", 5000),
    mk("C", "2026-01-15", 12500),
    mk("C", "2026-01-16", 12500),
    mk("D", "2026-02-20", 9000),
    mk("A", "2026-05-10", 20000),
    mk("A", "2026-05-11", 10000),
    mk("A", "2026-05-12", 10000),
    mk("B", "2026-05-01", 8000),
    mk("B", "2026-05-02", 7000),
  ];
  const h = computeHonors(loads);

  it("board: 2+ loads, top 5 — counts A,B,C in Q1 and A,B in Q2", () => {
    expect(h.get("A")?.board).toBe(2);
    expect(h.get("B")?.board).toBe(2);
    expect(h.get("C")?.board).toBe(1);
  });

  it("D (single load) never makes the board", () => {
    expect(h.get("D")).toBeUndefined();
  });

  it("gold/silver: 3+ loads only — A golds both quarters, B silver once", () => {
    expect(h.get("A")?.gold).toBe(2);
    expect(h.get("A")?.silver).toBe(0);
    expect(h.get("B")?.gold).toBe(0);
    expect(h.get("B")?.silver).toBe(1); // Q1 #2; Q2 B has only 2 loads → no podium
  });

  it("C is on the board but never on the podium (only 2 loads)", () => {
    expect(h.get("C")?.gold).toBe(0);
    expect(h.get("C")?.silver).toBe(0);
  });
});

describe("agentPrestige", () => {
  it("ranks by career record (rookie → legend)", () => {
    expect(agentPrestige(undefined)).toBe("rookie");
    expect(agentPrestige({ board: 0, gold: 0, silver: 0 })).toBe("rookie");
    expect(agentPrestige({ board: 4, gold: 0, silver: 0 })).toBe("contender");
    expect(agentPrestige({ board: 5, gold: 0, silver: 2 })).toBe("all-star");
    expect(agentPrestige({ board: 6, gold: 2, silver: 5 })).toBe("all-star"); // 2 golds < 3
    expect(agentPrestige({ board: 9, gold: 3, silver: 1 })).toBe("champion");
    expect(agentPrestige({ board: 12, gold: 8, silver: 0 })).toBe("legend");
  });
});

describe("agentSeasonLog", () => {
  const loads = [
    mk("A", "2026-02-01", 10000),
    mk("A", "2026-02-02", 10000),
    mk("A", "2026-02-03", 10000),
    mk("B", "2026-03-01", 10000),
    mk("B", "2026-03-02", 5000),
    mk("B", "2026-03-03", 5000),
    mk("C", "2026-01-15", 12500),
    mk("C", "2026-01-16", 12500),
    mk("A", "2026-05-01", 6000),
    mk("A", "2026-05-02", 6000),
  ];

  it("returns an agent's quarter-by-quarter finish, oldest first", () => {
    expect(agentSeasonLog(loads, "A").map((e) => [e.quarter, e.result])).toEqual(
      [
        ["2026-Q1", "gold"],
        ["2026-Q2", "board"],
      ],
    );
  });

  it("marks a board finish that never reached the podium", () => {
    expect(agentSeasonLog(loads, "C")).toEqual([
      { quarter: "2026-Q1", result: "board", revenue: 25000, loads: 2 },
    ]);
  });
});

describe("perAgentStats", () => {
  it("counts non-cancelled loads, sums delivered revenue, tracks last delivery", () => {
    const s = perAgentStats([
      mk("A", "2026-02-10", 10000),
      mk("A", "2026-03-10", 5000),
      mk("A", "2026-01-01", 3000, { load_status: "cancelled" }),
    ]);
    const a = s.get("A");
    expect(a?.loadCount).toBe(2); // cancelled excluded
    expect(a?.revenue).toBe(15000);
    expect(a?.lastWorked).toBe("2026-03-10");
  });
});

describe("rosterKpis", () => {
  const now = new Date("2026-07-15T00:00:00.000Z");
  const agents = [
    { agent_id: "A", rating: 5 },
    { agent_id: "B", rating: 2 },
    { agent_id: "C", rating: null },
  ] as any;

  it("counts roster, call-first, avoid, and the last-90d top earner", () => {
    const loads = [
      mk("A", "2026-07-01", 9000), // in window
      mk("B", "2026-07-02", 4000), // in window
      mk("A", "2026-01-01", 99999), // outside 90d — ignored for topEarner
    ];
    const k = rosterKpis(agents, loads, now);
    expect(k.total).toBe(3);
    expect(k.rated).toBe(2);
    expect(k.callFirst).toBe(1);
    expect(k.avoid).toBe(1);
    expect(k.topEarner?.agentId).toBe("A");
    expect(k.topEarner?.revenue).toBe(9000);
    expect(k.activeCount).toBe(2);
  });
});
