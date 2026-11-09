import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import { perAgentStats } from "./agentLeaderboard";

// The quarterly-honours tests went with the engine they covered (v1.266.0):
// medals, the prestige ladder, season logs, podium standings and rosterKpis
// rendered on no screen after phase B deleted their components.

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
  }) as unknown as Load;

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

  it("a TONU is never a booked load: it adds no load count and no revenue (GL-104)", () => {
    const s = perAgentStats([
      mk("A", "2026-02-10", 10000),
      mk("A", "2026-03-10", 2500, { load_status: "tonu" }),
    ]);
    expect(s.get("A")?.loadCount).toBe(1);
    expect(s.get("A")?.revenue).toBe(10000);
  });
});
