import { describe, it, expect } from "vitest";
import {
  passThroughCost,
  passThroughAsk,
  grossUpPremium,
  rateNetOfPassThrough,
} from "./passThrough";

// Jason's settings as of 2026-11-12.
const SETTINGS = { permitCostUsd: 40, escortCostPerLoadedMile: 2 };
const TAKE = 0.73; // 65% linehaul + 8% flatbed

describe("passThroughCost", () => {
  it("prices escorts on LOADED miles, never driven", () => {
    // Escorts meet you at the pickup; the deadhead is yours alone. On a 600/150
    // run that difference is $600 per escort pair, which is not a rounding.
    const c = passThroughCost({
      permitCount: 3,
      escortCount: 2,
      loadedMiles: 600,
      ...SETTINGS,
    });
    expect(c.permits).toBe(120);
    expect(c.escorts).toBe(2400); // 2 × $2 × 600 loaded — NOT 750 driven
    expect(c.total).toBe(2520);
  });

  it("an unconfigured cost cannot invent a charge", () => {
    const c = passThroughCost({
      permitCount: 3,
      escortCount: 2,
      loadedMiles: 600,
      permitCostUsd: null,
      escortCostPerLoadedMile: null,
    });
    expect(c).toEqual({ permits: 0, escorts: 0, total: 0 });
  });

  it("a legal load with nothing entered costs nothing", () => {
    expect(
      passThroughCost({
        permitCount: null,
        escortCount: null,
        loadedMiles: 500,
        ...SETTINGS,
      }).total,
    ).toBe(0);
  });

  it("permits without escorts, and escorts without permits, both price alone", () => {
    const p = passThroughCost({ permitCount: 2, escortCount: 0, loadedMiles: 500, ...SETTINGS });
    expect(p.total).toBe(80);
    const e = passThroughCost({ permitCount: 0, escortCount: 1, loadedMiles: 500, ...SETTINGS });
    expect(e.total).toBe(1000);
  });
});

describe("passThroughAsk — the gross-up", () => {
  it("REPRODUCES LOAD 7059883, the settlement this rule was read off", () => {
    // His bill was $1,235.43 and the load's basis gave up $1,722.58 to cover
    // it. The model predicts cost ÷ 0.73.
    const ask = passThroughAsk(1235.43, TAKE)!;
    expect(ask).toBeCloseTo(1692.37, 2);
    // Within $30 of what Landstar actually took out of the basis, the gap being
    // a single unmatched $40.01 line on that settlement.
    expect(Math.abs(ask - 1722.58)).toBeLessThan(31);
  });

  it("the whole point: 73 cents back on the dollar means asking for more", () => {
    expect(passThroughAsk(2520, TAKE)).toBeCloseTo(3452.05, 2);
    expect(grossUpPremium(2520, TAKE)).toBeCloseTo(932.05, 2);
  });

  it("A TRUE 100% PASS-THROUGH NEEDS NO GROSS-UP — load 1264478's treatment", () => {
    expect(passThroughAsk(2520, 1)).toBe(2520);
    expect(grossUpPremium(2520, 1)).toBe(0);
    // Own authority keeps everything, so still no uplift.
    expect(passThroughAsk(2520, 1.4)).toBe(2520);
  });

  it("THE IDENTITY IT RESTS ON: net = take × gross − cost", () => {
    // If the deducted charge is paid back at the same take, the shuffle cannot
    // change the receipt — so a load grossed up by cost/take leaves you exactly
    // where the same load with no permits would have.
    for (const cost of [120, 1235.43, 2520, 9000]) {
      for (const base of [4203, 6723, 11000]) {
        const grossed = base + passThroughAsk(cost, TAKE)!;
        const netAfterBills = TAKE * grossed - cost;
        expect(netAfterBills).toBeCloseTo(TAKE * base, 6);
      }
    }
  });

  it("no cost, no ask — and no usable take, no answer", () => {
    expect(passThroughAsk(0, TAKE)).toBe(0);
    expect(passThroughAsk(-5, TAKE)).toBe(0);
    expect(passThroughAsk(2520, null)).toBeNull();
    expect(passThroughAsk(2520, 0)).toBeNull();
    expect(grossUpPremium(2520, null)).toBeNull();
  });
});

describe("rateNetOfPassThrough", () => {
  it("strips the fiction out of a permitted load's headline", () => {
    // $7,800 over 750 driven reads $10.40 a mile. $3,452 of it is escorts and
    // permits, so what pays him is $5.80 — the number the ladder should grade.
    const net = rateNetOfPassThrough(7800, 3452.05)!;
    expect(net).toBeCloseTo(4347.95, 2);
    expect(net / 750).toBeCloseTo(5.8, 2);
    expect(7800 / 750).toBeCloseTo(10.4, 2); // what it would have claimed
  });

  it("a legal load is untouched", () => {
    expect(rateNetOfPassThrough(4000, 0)).toBe(4000);
    expect(rateNetOfPassThrough(4000, null)).toBe(4000);
  });

  it("never goes negative — an offer under its own permit bill reads zero, not a credit", () => {
    expect(rateNetOfPassThrough(1000, 3452)).toBe(0);
  });

  it("no rate, no answer", () => {
    expect(rateNetOfPassThrough(null, 3452)).toBeNull();
  });
});
