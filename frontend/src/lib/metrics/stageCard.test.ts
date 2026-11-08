import { describe, it, expect } from "vitest";
import { syntheticBook, TODAY } from "@/test/fixtures/book";
import { readPlanStatus } from "./planRead";
import { stageView, floorViews, payoffRead, truckFreeAndClear, NO_AS_OF_REASON } from "./stageCard";
import type { Obligation } from "@/types/obligation";

const now = new Date(`${TODAY}T00:00:00Z`);

const ob = (over: Partial<Obligation>): Obligation => ({
  obligation_id: "o1", label: "Truck note", amount: 1000, active: true, is_draw: false, category: "loan_lease",
  day_of_month: 5, draft_amount: null, on_pl: false, original_balance: 50000, current_balance: 10000,
  balance_as_of: "2026-10-01", payoff_date: null, asset_type: "truck", asset_id: null, ...over,
});

describe("payoffRead", () => {
  it("refuses a balance with no as-of date, in the card's exact words", () => {
    const r = payoffRead(ob({ balance_as_of: null }), now);
    expect(r).toEqual({ ok: false, reason: NO_AS_OF_REASON });
    expect(NO_AS_OF_REASON).toBe("the balance has no as-of date — set it on the Plan page");
  });
  it("dates a payoff from the balance and the monthly payment", () => {
    const r = payoffRead(ob({}), now);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.exact).toBe(false);
  });
  it("uses the contract end date when there is one", () => {
    const r = payoffRead(ob({ payoff_date: "2028-02-01" }), now);
    expect(r).toMatchObject({ ok: true, date: "2028-02-01", exact: true });
  });
  it("refuses when there is neither a payment nor an end date", () => {
    const r = payoffRead(ob({ amount: 0 }), now);
    expect(r.ok).toBe(false);
  });
});

describe("truckFreeAndClear", () => {
  it("names the month from the truck's own loan", () => {
    const r = truckFreeAndClear([ob({ payoff_date: "2028-02-01" })], now);
    expect(r).toEqual({ ok: true, text: "truck free and clear ≈ Feb 2028" });
  });
  it("names the refusal when no loan is tracked", () => {
    const r = truckFreeAndClear([], now);
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/no loan is tracked against the truck/);
  });
});

describe("the cards on the book's own plan status", () => {
  const book = syntheticBook();
  const read = readPlanStatus({
    today: TODAY, plans: [book.plan], accounts: book.accounts, snapshots: book.snapshots, opsChecks: book.opsChecks,
    obligations: book.obligations, loads: book.loads, fuelEntries: book.fuel, trips: book.trips, services: [],
  });

  it("the floors come in fill order: Ops, Maintenance, Vault", () => {
    const f = floorViews(read.status);
    expect(f?.map((x) => x.key)).toEqual(["ops", "maintenance", "vault"]);
  });

  it("no snapshot → no floors (null), and the stage refuses with the Vault balance as the missing input", () => {
    const none = readPlanStatus({
      today: TODAY, plans: [book.plan], accounts: book.accounts, snapshots: [], opsChecks: [],
      obligations: book.obligations, loads: book.loads, fuelEntries: [], trips: [], services: [],
    });
    expect(floorViews(none.status)).toBeNull();
    const v = stageView(none.status, none.plan, none.obligById, now);
    expect(v.kind).toBe("refused");
  });

  it("the stage names its position in the plan", () => {
    const v = stageView(read.status, read.plan, read.obligById, now);
    expect(["obligation", "balance", "complete", "refused"]).toContain(v.kind);
    if (v.kind === "obligation" || v.kind === "balance") {
      expect(v.n).toBeGreaterThan(0);
      expect(v.total).toBe(book.plan.stages.length);
    }
  });
});
