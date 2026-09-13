import { describe, it, expect } from "vitest";
import { touchCountsByAgent, originMarketsByAgent } from "./agentTouches";

const c = (agent_id: string, direction: "outbound" | "inbound", contacted_at: string) => ({
  agent_id,
  direction,
  contacted_at,
});

describe("touchCountsByAgent", () => {
  it("collapses multiple same-day outbound touches to one out-day", () => {
    // the Carolyn day: four logs, one day of attention
    const contacts = [
      c("a1", "outbound", "2026-09-09T09:10:00Z"),
      c("a1", "outbound", "2026-09-09T11:32:00Z"),
      c("a1", "outbound", "2026-09-09T14:05:00Z"),
      c("a1", "outbound", "2026-09-09T16:44:00Z"),
      c("a1", "inbound", "2026-09-09T17:00:00Z"),
    ];
    const t = touchCountsByAgent(contacts, "2026-08-11", "2026-09-09").get("a1");
    expect(t).toEqual({ outDays: 1, inbound: 1 });
  });

  it("counts distinct days across the window and every inbound event", () => {
    const contacts = [
      c("a1", "outbound", "2026-09-01T10:00:00Z"),
      c("a1", "outbound", "2026-09-03T10:00:00Z"),
      c("a1", "outbound", "2026-09-03T15:00:00Z"),
      c("a1", "inbound", "2026-09-04T10:00:00Z"),
      c("a1", "inbound", "2026-09-06T10:00:00Z"),
      c("a2", "outbound", "2026-09-05T10:00:00Z"),
    ];
    const m = touchCountsByAgent(contacts, "2026-09-01", "2026-09-09");
    expect(m.get("a1")).toEqual({ outDays: 2, inbound: 2 });
    expect(m.get("a2")).toEqual({ outDays: 1, inbound: 0 });
  });

  it("respects the window bounds inclusively and drops the rest", () => {
    const contacts = [
      c("a1", "outbound", "2026-08-31T23:59:00Z"), // before
      c("a1", "outbound", "2026-09-01T00:00:00Z"), // first day
      c("a1", "inbound", "2026-09-09T12:00:00Z"), // last day
      c("a1", "inbound", "2026-09-10T00:01:00Z"), // after
    ];
    expect(touchCountsByAgent(contacts, "2026-09-01", "2026-09-09").get("a1")).toEqual({
      outDays: 1,
      inbound: 1,
    });
  });

  it("empty input -> empty map; agent with no touches has no entry", () => {
    expect(touchCountsByAgent([], "2026-09-01", "2026-09-09").size).toBe(0);
  });
});

describe("originMarketsByAgent", () => {
  const l = (agent_id: string | null, origin_city: string | null, origin_state: string | null) => ({
    agent_id,
    origin_city,
    origin_state,
  });

  it("ranks by load count, ties alphabetically, caps at top N", () => {
    const loads = [
      l("a1", "Savannah", "GA"),
      l("a1", "Savannah", "GA"),
      l("a1", "Savannah", "GA"),
      l("a1", "Vidalia", "GA"),
      l("a1", "Vidalia", "GA"),
      l("a1", "Macon", "GA"),
      l("a1", "Albany", "GA"), // ties with Macon at 1 — Albany wins alphabetically
    ];
    const m = originMarketsByAgent(loads, 3).get("a1");
    expect(m).toEqual([
      { city: "Savannah", state: "GA", n: 3 },
      { city: "Vidalia", state: "GA", n: 2 },
      { city: "Albany", state: "GA", n: 1 },
    ]);
  });

  it("merges case/whitespace variants of the same market", () => {
    const loads = [l("a1", "Savannah ", "GA"), l("a1", "SAVANNAH", "ga")];
    const m = originMarketsByAgent(loads).get("a1");
    expect(m).toHaveLength(1);
    expect(m?.[0].n).toBe(2);
  });

  it("skips loads with no agent or unusable origin; no loads -> no entry", () => {
    const loads = [l(null, "Savannah", "GA"), l("a1", "", "GA"), l("a1", "Savannah", null)];
    expect(originMarketsByAgent(loads).get("a1")).toBeUndefined();
  });

  // Decision 5A: the MARK decides which end is the market, not the direction
  // of travel. 2543056 is the case — Atlanta was only a tradeshow yard.
  it("a receiver-end load counts its DESTINATION", () => {
    const loads = [
      {
        agent_id: "mike",
        customer_end: "receiver" as const,
        origin_city: "Atlanta",
        origin_state: "GA",
        destination_city: "Troutman",
        destination_state: "NC",
      },
    ];
    expect(originMarketsByAgent(loads).get("mike")).toEqual([
      { city: "Troutman", state: "NC", n: 1 },
    ]);
  });

  it("a 'neither' load drops out of the footprint entirely", () => {
    const spot = {
      agent_id: "a1",
      customer_end: "neither" as const,
      origin_city: "Laredo",
      origin_state: "TX",
      destination_city: "Tulsa",
      destination_state: "OK",
    };
    expect(originMarketsByAgent([spot]).get("a1")).toBeUndefined();
    // and it leaves the agent's real markets alone
    expect(originMarketsByAgent([spot, l("a1", "Savannah", "GA")]).get("a1")).toEqual([
      { city: "Savannah", state: "GA", n: 1 },
    ]);
  });
});
