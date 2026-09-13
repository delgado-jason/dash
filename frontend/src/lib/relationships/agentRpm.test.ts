import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import { agentAllInRpm, allInOver, deliveredCount, lastLoadKey } from "./agentRpm";

const NOW = new Date("2026-09-12T15:00:00Z");

// Numerics arrive as STRINGS from the API — fixtures keep it that way.
const load = (o: Partial<Load>): Load =>
  ({
    load_id: "l",
    agent_id: "a1",
    load_status: "delivered",
    pickup_date: "2026-08-20",
    delivery_date: "2026-08-22",
    linehaul: "1000",
    fuel_surcharge: "200",
    total_accessorials: "0",
    loaded_miles: 200,
    deadhead_miles: 50,
    ...o,
  }) as unknown as Load;

// The arithmetic itself, over whatever set of loads the caller has chosen —
// exported so an agency desk (lib/agencies/agencyMetrics) is graded by the
// very same rule that grades one person. Tested directly, because both
// callers now depend on what it does with nothing and with half a mileage log.
describe("allInOver — the all-in arithmetic on its own", () => {
  it("no loads at all is not a rate: null, 0, false, 0 — never $0.00 per mile", () => {
    expect(allInOver([])).toEqual({ rpm: null, loads: 0, partial: false, gross: 0 });
  });

  it("loads with no miles logged still have no rate — the gross is real, the rate is not", () => {
    const r = allInOver([load({ loaded_miles: 0, deadhead_miles: 0 })]);
    expect(r.rpm).toBeNull();
    expect(r.gross).toBe(1200);
    expect(r.loads).toBe(1);
  });

  it("mixes a fully logged load with a deadhead-less one: loaded miles only, average marked partial", () => {
    const r = allInOver([
      load({}), // $1,200 over 200 + 50 miles
      load({ load_id: "l2", linehaul: "900", fuel_surcharge: "100", loaded_miles: 150, deadhead_miles: null as unknown as number }),
    ]);
    // (1200 + 1000) ÷ (250 + 150) — the second load's missing deadhead is not
    // guessed at, it is simply absent from the denominator.
    expect(r.rpm).toBeCloseTo(5.5, 6);
    expect(r.gross).toBe(2200);
    expect(r.loads).toBe(2);
    expect(r.partial).toBe(true);
  });

  it("takes the loads it is handed — it does not filter by status or agent", () => {
    // The windowing and the "is it delivered" question belong to the caller;
    // this is the arithmetic, and an agency's set is chosen differently.
    const r = allInOver([load({ agent_id: "someone-else", load_status: "booked" })]);
    expect(r.loads).toBe(1);
    expect(r.rpm).toBeCloseTo(4.8, 6);
  });
});

describe("agentAllInRpm — all-in gross over the trailing 12 months", () => {
  it("Σ gross ÷ Σ (loaded + deadhead), coercing string numerics", () => {
    const r = agentAllInRpm([load({}), load({ load_id: "l2", linehaul: "800", loaded_miles: 150, deadhead_miles: 0 })], "a1", NOW);
    // (1200 + 1000) / (250 + 150)
    expect(r.rpm).toBeCloseTo(5.5, 6);
    expect(r.loads).toBe(2);
    expect(r.gross).toBe(2200);
    expect(r.partial).toBe(false);
  });

  it("prefers the server's gross_revenue when present", () => {
    const r = agentAllInRpm([load({ gross_revenue: "1500" })], "a1", NOW);
    expect(r.rpm).toBeCloseTo(6, 6);
  });

  it("a null deadhead contributes loaded miles only and marks the average partial", () => {
    const r = agentAllInRpm([load({ deadhead_miles: null as unknown as number })], "a1", NOW);
    expect(r.rpm).toBeCloseTo(6, 6); // 1200 / 200
    expect(r.partial).toBe(true);
  });

  it("only DELIVERED loads for THIS agent count", () => {
    const loads = [
      load({}),
      load({ load_id: "b", load_status: "booked", linehaul: "9000" }),
      load({ load_id: "c", load_status: "cancelled", linehaul: "9000" }),
      load({ load_id: "o", agent_id: "someone-else", linehaul: "9000" }),
    ];
    const r = agentAllInRpm(loads, "a1", NOW);
    expect(r.loads).toBe(1);
    expect(r.gross).toBe(1200);
  });

  it("the window is pickup_date within 365 days of now, inclusive at both ends", () => {
    const loads = [
      load({ load_id: "edge", pickup_date: "2025-09-12" }), // exactly 365 days back — in
      load({ load_id: "old", pickup_date: "2025-09-11", linehaul: "9000" }), // out
      load({ load_id: "today", pickup_date: "2026-09-12" }), // in
      load({ load_id: "future", pickup_date: "2026-09-13", linehaul: "9000" }), // out
      // a DATE that arrives as a timestamp: the day is sliced off, so 23:00Z on
      // the edge day is still the edge day — in, not shifted out by the hour
      load({ load_id: "iso-edge", pickup_date: "2025-09-12T23:00:00.000Z" }),
      load({ load_id: "iso-old", pickup_date: "2025-09-11T23:00:00.000Z", linehaul: "9000" }), // out
    ];
    const r = agentAllInRpm(loads, "a1", NOW);
    expect(r.loads).toBe(3);
    expect(r.gross).toBe(3600);
  });

  it("no miles → rpm null (never $0.00); no loads → the empty shape", () => {
    expect(agentAllInRpm([load({ loaded_miles: 0, deadhead_miles: 0 })], "a1", NOW)).toEqual({
      rpm: null,
      loads: 1,
      partial: false,
      gross: 1200,
    });
    expect(agentAllInRpm([], "a1", NOW)).toEqual({ rpm: null, loads: 0, partial: false, gross: 0 });
  });
});

describe("deliveredCount / lastLoadKey — lifetime, not windowed", () => {
  it("counts every delivered load ever, ignoring the RPM window", () => {
    const loads = [load({}), load({ load_id: "old", pickup_date: "2024-01-01" }), load({ load_id: "b", load_status: "booked" })];
    expect(deliveredCount(loads, "a1")).toBe(2);
    expect(deliveredCount(loads, "nobody")).toBe(0);
    expect(deliveredCount([], "a1")).toBe(0);
  });

  it("last load = the latest delivery (or pickup when undelivered) over non-cancelled loads", () => {
    const loads = [
      load({ delivery_date: "2026-08-22" }),
      load({ load_id: "b", load_status: "booked", pickup_date: "2026-09-14", delivery_date: null }),
      load({ load_id: "c", load_status: "cancelled", pickup_date: "2026-12-01", delivery_date: "2026-12-02" }),
    ];
    expect(lastLoadKey(loads, "a1")).toBe("2026-09-14");
    expect(lastLoadKey([], "a1")).toBeNull();
  });

  it("slices the day off a DATE that arrives as a timestamp", () => {
    expect(lastLoadKey([load({ delivery_date: "2026-08-31T05:00:00.000Z" })], "a1")).toBe("2026-08-31");
  });
});
