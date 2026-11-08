import { describe, expect, it } from "vitest";
import { syntheticBook, TODAY } from "@/test/fixtures/book";
import { dayLabel, IRS_PER_DIEM_RATE, listWords, monthLabel, PLANNING_INPUTS, runIntegrityChecks, typed } from "./checks";
import type { IntegrityInputs } from "./issue";

const empty = (over: Partial<IntegrityInputs> = {}): IntegrityInputs => ({
  today: TODAY,
  loads: [],
  trips: [],
  fuel: [],
  settlements: [],
  settlementLines: [],
  periods: [],
  financials: [],
  obligations: [],
  accessorials: [],
  payRates: [],
  schedule: null,
  snapshots: [],
  accounts: [],
  plan: null,
  assumptions: syntheticBook().assumptions,
  services: [],
  basis: null,
  ...over,
});

describe("formatting helpers", () => {
  it("monthLabel spells a month the way the basis does", () => {
    expect(monthLabel("2026-10-01")).toBe("Oct ’26");
    expect(monthLabel("2027-01-01T00:00:00.000Z")).toBe("Jan ’27");
  });
  it("dayLabel is a short month and a bare day", () => {
    expect(dayLabel("2026-10-23")).toBe("Oct 23");
    expect(dayLabel("2026-05-06T00:00:00Z")).toBe("May 6");
  });
  it("listWords joins by commas and 'and'", () => {
    expect(listWords([])).toBe("");
    expect(listWords(["May 6"])).toBe("May 6");
    expect(listWords(["May 6", "May 20"])).toBe("May 6 and May 20");
    expect(listWords(["a", "b", "c"])).toBe("a, b and c");
  });
  it("typed: blank is missing, zero is a number", () => {
    expect(typed(null)).toBeNull();
    expect(typed("")).toBeNull();
    expect(typed("  ")).toBeNull();
    expect(typed("abc")).toBeNull();
    expect(typed("0.00")).toBe(0);
    expect(typed(5)).toBe(5);
  });
  it("the IRS rate is the FY2026 80", () => {
    expect(IRS_PER_DIEM_RATE).toBe(80);
  });
});

describe("edge cases", () => {
  it("empty inputs with assumptions set raise nothing", () => {
    expect(runIntegrityChecks(empty())).toEqual([]);
  });

  it("null assumptions is the only issue on empty inputs", () => {
    const i = runIntegrityChecks(empty({ assumptions: null }));
    expect(i).toHaveLength(1);
    expect(i[0].key).toBe("INT-INPUT-BLANK:assumptions");
  });

  it("each planning input blank is its own issue; a typed zero is set", () => {
    const blank = Object.fromEntries(PLANNING_INPUTS.map((p) => [p.field, ""])) as unknown as IntegrityInputs["assumptions"];
    expect(runIntegrityChecks(empty({ assumptions: blank }))).toHaveLength(PLANNING_INPUTS.length);
    const zeros = Object.fromEntries(PLANNING_INPUTS.map((p) => [p.field, "0.00"])) as unknown as IntegrityInputs["assumptions"];
    expect(runIntegrityChecks(empty({ assumptions: zeros }))).toEqual([]);
  });

  it("no loads means no statement line can be dated against a first load", () => {
    const b = syntheticBook();
    expect(runIntegrityChecks(empty({ settlementLines: b.settlementLines }))).toEqual([]);
  });

  it("a null schedule skips the per-diem check and prints the fallback without a percent", () => {
    const b = syntheticBook();
    const i = runIntegrityChecks(empty({ accessorials: b.accessorials, schedule: null }));
    expect(i.filter((x) => x.id === "INT-ACC-UNRATED").length).toBeGreaterThan(0);
    expect(i.some((x) => x.id === "INT-SETTING")).toBe(false);
    expect(i.find((x) => x.id === "INT-ACC-UNRATED")?.title).toMatch(/paid at the fallback\.$/);
  });

  it("a pay-rate match ignores case and spaces", () => {
    const b = syntheticBook();
    const i = runIntegrityChecks(
      empty({ accessorials: b.accessorials, payRates: [...b.payRates, { accessorial_type: " job-site delivery ", pay_pct: 0.5 }] }),
    );
    expect(i).toEqual([]);
  });

  it("an unfiled month is found without a basis object", () => {
    const b = syntheticBook();
    const i = runIntegrityChecks(empty({ periods: b.periods.slice(0, 5) }));
    expect(i.map((x) => x.id)).toEqual(["INT-PNL-UNFILED"]);
    expect(i[0].title).toBe("No P&L for Oct ’26 — break-even stands on 5 of 6 months.");
  });

  it("an undated note shows only when a balance is set", () => {
    const b = syntheticBook();
    const o = { ...b.obligations[0], balance_as_of: null };
    const none = { ...b.obligations[1], current_balance: null, balance_as_of: null };
    expect(runIntegrityChecks(empty({ obligations: [none] }))).toEqual([]);
    expect(runIntegrityChecks(empty({ obligations: [o] })).map((x) => x.id)).toEqual(["INT-NOTE-UNDATED"]);
  });

  it("a per diem of exactly the IRS rate is quiet; cents print with cents", () => {
    const b = syntheticBook();
    expect(runIntegrityChecks(empty({ schedule: { ...b.schedule, per_diem_rate: 80 } }))).toEqual([]);
    const i = runIntegrityChecks(empty({ schedule: { ...b.schedule, per_diem_rate: 69.5 } }));
    expect(i[0].title).toBe("Per diem is $69.50/day; the IRS transportation rate is $80.");
  });
});
