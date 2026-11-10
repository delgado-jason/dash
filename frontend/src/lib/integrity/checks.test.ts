import { describe, expect, it } from "vitest";
import { syntheticBook, TODAY } from "@/test/fixtures/book";
import { dayLabel, IRS_PER_DIEM_RATE, listWords, monthLabel, PLANNING_INPUTS, runIntegrityChecks, typed } from "./checks";
import type { IntegrityInputs } from "./issue";

const empty = (over: Partial<IntegrityInputs> = {}): IntegrityInputs => ({
  today: TODAY,
  splits: syntheticBook().splits,
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
  perDiemRates: syntheticBook().perDiemRates,
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

  it("no split in force prints the accessorial fallback without a percent (the pct lives on the dated split now)", () => {
    const b = syntheticBook();
    const i = runIntegrityChecks(empty({ accessorials: b.accessorials, schedule: null, splits: [] }));
    expect(i.filter((x) => x.id === "INT-ACC-UNRATED").length).toBeGreaterThan(0);
    expect(i.some((x) => x.id === "INT-SETTING")).toBe(false);
    expect(i.find((x) => x.id === "INT-ACC-UNRATED")?.title).toMatch(/paid at the fallback\.$/);
  });

  it("a pay-rate match ignores case and spaces", () => {
    const b = syntheticBook();
    const i = runIntegrityChecks(
      empty({ accessorials: b.accessorials, payRates: [...b.payRates, { accessorial_type: " job-site delivery ", pay_pct: 0.5, pass_through: false }] }),
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
    const row = { rate_id: "r", effective_from: "2026-01-01", rate: 80, note: null };
    expect(runIntegrityChecks(empty({ perDiemRates: [row] }))).toEqual([]);
    const i = runIntegrityChecks(empty({ perDiemRates: [{ ...row, rate: 69.5 }] }));
    expect(i[0].title).toBe("Per diem is $69.50/day; the IRS transportation rate is $80.");
    expect(i[0].detail.startsWith("The rate in force today started Jan 1, 2026. ")).toBe(true);
  });

  it("no rate in force today raises the unpriced issue", () => {
    const none = runIntegrityChecks(empty({ perDiemRates: [] }));
    expect(none.map((x) => x.id)).toEqual(["INT-SETTING"]);
    expect(none[0].title).toBe("No per-diem rate covers today — every day out is unpriced until one does.");
    expect(none[0].detail).toBe("No rates are on file.");
    const later = runIntegrityChecks(empty({ perDiemRates: [{ rate_id: "r", effective_from: "2027-10-01", rate: 86, note: null }] }));
    expect(later[0].detail).toBe("The oldest rate on file starts Oct 1, 2027; add a row with a start on or before today.");
  });
});

describe("INT-SETTING · an unknown rates list (the fetch failed) is skipped", () => {
  it("null raises nothing — a failed fetch is never read as no rate on file", () => {
    expect(runIntegrityChecks(empty({ perDiemRates: null })).filter((i) => i.id === "INT-SETTING")).toEqual([]);
  });
});

describe("INT-ODO-TRIP-INSIDE — a trip swallowed by a load's odometer window", () => {
  // Jason, 2026-11-10: "I don't enter the trips on the load form. I enter the
  // trips on the trips page." That is the risk this check exists for — a
  // deadhead logged AFTER the load was created leaves the load's start carried
  // from the load before it, so the load's window swallows the trip and the
  // miles count twice. INT-ODO-OVERLAP never saw it: that one compares loads
  // to LOADS only.
  const load = (over = {}) =>
    ({ load_id: "l1", load_number: "4333118", load_status: "delivered",
       delivery_date: "2026-11-07", odometer_start: 611054, odometer_end: 612773, ...over }) as never;
  const trip = (over = {}) =>
    ({ trip_date: "2026-11-03", status: "completed", trip_type: "deadhead",
       odometer_start: 611054, odometer_end: 611212, ...over }) as never;
  const ids = (over: Partial<Parameters<typeof empty>[0]>) =>
    runIntegrityChecks(empty(over)).map((i) => i.id);

  it("fires when the trip's span sits inside the load's window", () => {
    // load 611,054–612,773 swallowing a 611,054→611,212 trip is the stale
    // carry exactly: the load should have started at 611,212.
    expect(ids({ loads: [load()], trips: [trip({ odometer_start: 611100, odometer_end: 611212 })] }))
      .toContain("INT-ODO-TRIP-INSIDE");
  });

  it("does NOT fire when the trip TILES onto the load — touching ends are correct", () => {
    // The healthy shape from Jason's own book: the load ends where the trip
    // begins. Flagging this would cry wolf on every well-kept week.
    expect(ids({
      loads: [load({ odometer_start: 610284, odometer_end: 611054 })],
      trips: [trip({ odometer_start: 611054, odometer_end: 611212 })],
    })).not.toContain("INT-ODO-TRIP-INSIDE");
  });

  it("does not fire for a trip entirely before or after the load", () => {
    expect(ids({ loads: [load()], trips: [trip({ odometer_start: 609000, odometer_end: 610000 })] }))
      .not.toContain("INT-ODO-TRIP-INSIDE");
    expect(ids({ loads: [load()], trips: [trip({ odometer_start: 613000, odometer_end: 613500 })] }))
      .not.toContain("INT-ODO-TRIP-INSIDE");
  });

  it("catches a PARTIAL overlap too, not only full containment", () => {
    expect(ids({ loads: [load()], trips: [trip({ odometer_start: 612000, odometer_end: 613500 })] }))
      .toContain("INT-ODO-TRIP-INSIDE");
  });

  it("ignores a cancelled trip and a half-logged one", () => {
    expect(ids({ loads: [load()], trips: [trip({ status: "cancelled", odometer_start: 611100, odometer_end: 611212 })] }))
      .not.toContain("INT-ODO-TRIP-INSIDE");
    expect(ids({ loads: [load()], trips: [trip({ odometer_start: 611100, odometer_end: null })] }))
      .not.toContain("INT-ODO-TRIP-INSIDE");
  });
});
