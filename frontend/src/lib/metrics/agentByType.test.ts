import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { RateLadder } from "./rateTargets";
import {
  agentByType,
  bookOf,
  verdictFor,
  worthASecondCall,
  bookShape,
  VERDICT_MIN_LOADS,
} from "./agentByType";

// Jason's live rungs, 2026-11-12.
const LADDERS = {
  standard: { breakEven: 4.0347, minimum: 4.7495, target: 5.0434, prime: 5.3782 } as RateLadder,
  specialized: { breakEven: 4.0347, minimum: 5.6042, target: 6.0238, prime: 6.508 } as RateLadder,
};

let seq = 0;
/** A delivered load at a given rate per DRIVEN mile. */
const load = (rpm: number, type = "flatbed", driven = 1000, date = "2026-09-01"): Load =>
  ({
    load_id: `l${++seq}`,
    load_status: "delivered",
    load_type: type,
    delivery_date: date,
    odometer_start: 100000,
    odometer_end: 100000 + driven,
    loaded_miles: driven,
    deadhead_miles: 0,
    linehaul: String(rpm * driven),
    fuel_surcharge: "0",
    total_accessorials: "0",
  }) as unknown as Load;

describe("bookOf", () => {
  it("splits on the same rule the Scorer and the ladder use", () => {
    expect(bookOf(load(5, "flatbed"))).toBe("standard");
    expect(bookOf(load(5, "oversize"))).toBe("specialized");
    expect(bookOf(load(5, "hazmat"))).toBe("specialized");
    expect(bookOf(load(5, "heavy haul"))).toBe("specialized");
  });
});

describe("verdictFor", () => {
  it("uses the Scorer's five bands, inclusive at each rung", () => {
    const v = (r: number) => verdictFor(r, LADDERS.standard);
    expect(v(4.03)).toBe("below-cost");
    expect(v(4.0347)).toBe("thin");
    expect(v(4.7495)).toBe("profitable");
    expect(v(5.0434)).toBe("solid");
    expect(v(5.3782)).toBe("prime");
    expect(v(9)).toBe("prime");
  });

  it("THE SAME RATE GETS DIFFERENT VERDICTS IN THE TWO BOOKS", () => {
    // $5.00 clears the standard minimum and is thin on specialized. This is
    // the whole reason two rungs exist, and why one pooled column lies.
    expect(verdictFor(5.0, LADDERS.standard)).toBe("profitable");
    expect(verdictFor(5.0, LADDERS.specialized)).toBe("thin");
  });

  it("no rate or no ladder, no verdict", () => {
    expect(verdictFor(null, LADDERS.standard)).toBeNull();
    expect(verdictFor(5, { breakEven: null, minimum: null, target: null, prime: null })).toBeNull();
  });
});

describe("agentByType", () => {
  it("REPRODUCES ROR — best standard desk, worst oversize one", () => {
    const r = agentByType(
      [load(6.05), load(6.05), load(2.46, "oversize")],
      LADDERS,
    );
    expect(r.standard.rpm).toBeCloseTo(6.05, 2);
    expect(r.standard.verdict).toBe("prime");
    expect(r.specialized.rpm).toBeCloseTo(2.46, 2);
    // one oversize load: a number, never a grade
    expect(r.specialized.loads).toBe(1);
    expect(r.specialized.verdict).toBeNull();
  });

  it("REPRODUCES JVL — the mirror image, which pooling erases", () => {
    const jvl = agentByType(
      [load(3.81), load(7.23, "oversize"), load(7.23, "oversize")],
      LADDERS,
    );
    expect(jvl.standard.rpm).toBeCloseTo(3.81, 2);
    expect(jvl.specialized.verdict).toBe("prime");
    // ...and the pooled median of all three is 7.23 — which describes neither
    // half and is the number the old column showed.
    const pooled = [3.81, 7.23, 7.23].sort((a, b) => a - b)[1];
    expect(pooled).toBeCloseTo(7.23, 2);
  });

  it("A BOOK THEY NEVER SENT IS NULL, NOT ZERO", () => {
    // Zero on a rate column reads as "they pay nothing".
    const r = agentByType([load(5), load(5)], LADDERS);
    expect(r.specialized.loads).toBe(0);
    expect(r.specialized.rpm).toBeNull();
    expect(r.specialized.verdict).toBeNull();
  });

  it("one load is a number, two is a verdict", () => {
    expect(VERDICT_MIN_LOADS).toBe(2);
    expect(agentByType([load(6)], LADDERS).standard.verdict).toBeNull();
    expect(agentByType([load(6), load(6)], LADDERS).standard.verdict).toBe("prime");
  });

  it("ignores loads that are not delivered, and loads with no miles", () => {
    const undelivered = { ...load(9), load_status: "booked" } as Load;
    const noMiles = { ...load(9), odometer_start: 0, odometer_end: 0, loaded_miles: 0, deadhead_miles: 0 } as Load;
    const r = agentByType([load(5), load(5), undelivered, noMiles], LADDERS);
    expect(r.standard.loads).toBe(2);
    expect(r.standard.rpm).toBeCloseTo(5, 6);
  });

  it("falls back to loaded + deadhead when the odometer is missing", () => {
    const planned = {
      ...load(0),
      odometer_start: 0,
      odometer_end: 0,
      loaded_miles: 800,
      deadhead_miles: 200,
      linehaul: "5000",
    } as Load;
    // 5000 / (800 + 200) = $5.00
    expect(agentByType([planned], LADDERS).standard.rpm).toBeCloseTo(5, 6);
  });
});

describe("worthASecondCall", () => {
  const byAgent = (m: Record<string, Load[]>) => new Map(Object.entries(m));

  it("ONE-OFFS ONLY, and only the ones that cleared their own rung", () => {
    const r = worthASecondCall(
      byAgent({
        good: [load(6.25, "oversize")], // one load, over the $5.60 spec rung
        cheap: [load(4.0, "oversize")], // one load, under it
        goodStd: [load(5.1)], // one load, over the $4.75 std rung
        repeat: [load(9), load(9)], // two loads — not a one-off
      }),
      LADDERS,
    );
    expect(r.map((x) => x.agentId)).toEqual(["good", "goodStd"]);
  });

  it("is graded against ITS OWN book's rung, not a shared one", () => {
    // $5.00 clears standard and misses specialized.
    const r = worthASecondCall(
      byAgent({ std: [load(5.0)], spec: [load(5.0, "oversize")] }),
      LADDERS,
    );
    expect(r.map((x) => x.agentId)).toEqual(["std"]);
  });

  it("sorts by how far over the rung they landed, best first", () => {
    const r = worthASecondCall(
      byAgent({ a: [load(5.0)], b: [load(6.5)], c: [load(5.5)] }),
      LADDERS,
    );
    expect(r.map((x) => x.agentId)).toEqual(["b", "c", "a"]);
    expect(r[0].over).toBeCloseTo(6.5 - 4.7495, 4);
  });

  it("exactly on the rung counts — it cleared it", () => {
    expect(worthASecondCall(byAgent({ a: [load(4.7495)] }), LADDERS)).toHaveLength(1);
  });

  it("a desk with no delivered load is not a one-off", () => {
    const booked = { ...load(9), load_status: "booked" } as Load;
    expect(worthASecondCall(byAgent({ a: [booked] }), LADDERS)).toHaveLength(0);
  });
});

describe("bookShape", () => {
  it("REPRODUCES HIS BOOK — a long tail, not a customer base", () => {
    const m = new Map<string, Load[]>();
    // 45 desks x 1 load, 7 x 2, 3 x 4, 1 x 6 — his real distribution
    for (let i = 0; i < 45; i++) m.set(`one${i}`, [load(4, "flatbed", 1000)]);
    for (let i = 0; i < 7; i++) m.set(`two${i}`, [load(4), load(4)]);
    for (let i = 0; i < 3; i++) m.set(`few${i}`, [load(4), load(4), load(4), load(4)]);
    m.set("many", Array.from({ length: 6 }, () => load(4)));
    const s = bookShape(m);
    expect(s.desks).toBe(56);
    expect(s.loads).toBe(45 + 14 + 12 + 6);
    expect(s.oneLoadDesks).toBe(45);
    // every load is the same size here, so the share is just the load share
    expect(s.oneLoadShare).toBeCloseTo(45 / s.loads, 6);
  });

  it("a desk with only undelivered loads is not counted at all", () => {
    const booked = { ...load(9), load_status: "booked" } as Load;
    const s = bookShape(new Map([["a", [booked]], ["b", [load(4)]]]));
    expect(s.desks).toBe(1);
    expect(s.loads).toBe(1);
  });

  it("an empty book answers null rather than a zero share", () => {
    expect(bookShape(new Map()).oneLoadShare).toBeNull();
  });
});
