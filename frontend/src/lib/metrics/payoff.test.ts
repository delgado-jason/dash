import { describe, it, expect } from "vitest";
import type { Obligation } from "@/types/obligation";
import { computePayoff, isPayoffTracked, draftsSinceBalance } from "./payoff";

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

describe("computePayoff — the balance TODAY is the statement less the drafts since it was read (2026-11-04)", () => {
  it("counts a draft per month on the draft day after the as-of day: Mar 5 statement, drafts on the 26th, Jul 13 today → 4", () => {
    const p = computePayoff(
      O({ amount: 1575, current_balance: 44100, original_balance: 69000, balance_as_of: "2026-03-05", day_of_month: 26 } as Partial<Obligation>),
      NOW,
    );
    expect(p.draftsSince).toBe(4); // Mar 26, Apr 26, May 26, Jun 26 — Jul 26 hasn't come
    expect(p.statementOwed).toBe(44100);
    expect(p.owed).toBe(44100 - 4 * 1575);
    expect(p.balanceAsOf).toBe("2026-03-05");
    expect(p.paidPct).toBeCloseTo((69000 - (44100 - 6300)) / 69000, 4);
    expect(p.paymentsLeft).toBe(24); // 37,800 / 1,575
  });

  it("no draft day on file → the as-of day is the draft day; a draft dated the as-of day itself is already in the statement", () => {
    const p = computePayoff(O({ amount: 1000, current_balance: 10000, balance_as_of: "2026-03-05" } as Partial<Obligation>), NOW);
    expect(p.draftsSince).toBe(4); // Apr 5, May 5, Jun 5, Jul 5
    expect(p.owed).toBe(6000);
  });

  it("a statement read today, or with no as-of day, stands as it is", () => {
    expect(computePayoff(O({ amount: 1000, current_balance: 10000, balance_as_of: "2026-07-13" } as Partial<Obligation>), NOW).owed).toBe(10000);
    expect(computePayoff(O({ amount: 1000, current_balance: 10000 }), NOW).draftsSince).toBe(0);
  });

  it("drafts can pay a note off before the contract says so, and never below zero", () => {
    const p = computePayoff(O({ amount: 3000, current_balance: 5000, balance_as_of: "2026-01-02", day_of_month: 15 } as Partial<Obligation>), NOW);
    expect(p.draftsSince).toBe(6); // Jan 15 … Jun 15
    expect(p.owed).toBe(0);
    expect(p.isPaidOff).toBe(true);
  });

  it("the 31st clamps to a short month's last day", () => {
    expect(draftsSinceBalance({ balance_as_of: "2026-01-31", day_of_month: 31 }, new Date("2026-03-01T00:00:00Z"))).toBe(1); // Feb 28
  });
});
