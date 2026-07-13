import { describe, it, expect } from "vitest";
import type { Obligation } from "@/types/obligation";
import { computePayoff, isPayoffTracked } from "./payoff";

const NOW = new Date("2026-07-13T12:00:00Z");

const O = (o: Partial<Obligation>): Obligation =>
  ({
    obligation_id: "x",
    label: "L",
    amount: 0,
    active: true,
    is_draw: false,
    original_balance: null,
    current_balance: null,
    balance_as_of: null,
    payoff_date: null,
    asset_type: null,
    asset_id: null,
    ...o,
  }) as Obligation;

describe("isPayoffTracked", () => {
  it("is tracked once a current balance exists", () => {
    expect(isPayoffTracked(O({ current_balance: 44100 }))).toBe(true);
    expect(isPayoffTracked(O({}))).toBe(false);
  });
});

describe("computePayoff", () => {
  it("estimates at pace when there's no end date (the truck lease)", () => {
    const p = computePayoff(
      O({ amount: 1575, current_balance: 44100, original_balance: 69000 }),
      NOW,
    );
    expect(p.owed).toBe(44100);
    expect(p.paidPct).toBeCloseTo((69000 - 44100) / 69000, 4); // ~36% owned
    expect(p.paymentsLeft).toBe(28); // 44100 / 1575
    expect(p.exact).toBe(false);
    expect(p.payoffDate).toBe("2028-11-13"); // 28 months out
    expect(p.isPaidOff).toBe(false);
  });

  it("uses the contract date exactly when present (the trailer loan)", () => {
    const p = computePayoff(
      O({
        amount: 475.19,
        current_balance: 38298.61,
        original_balance: 39408.09,
        payoff_date: "2036-01-27",
      }),
      NOW,
    );
    expect(p.paidPct).toBeCloseTo((39408.09 - 38298.61) / 39408.09, 4); // ~2.8%
    expect(p.exact).toBe(true);
    expect(p.payoffDate).toBe("2036-01-27");
    expect(p.paymentsLeft).toBe(114); // full months to maturity
  });

  it("is paid off at zero", () => {
    const p = computePayoff(
      O({ amount: 1575, current_balance: 0, original_balance: 69000 }),
      NOW,
    );
    expect(p.isPaidOff).toBe(true);
    expect(p.paidPct).toBe(1);
    expect(p.paymentsLeft).toBe(0);
  });
});
