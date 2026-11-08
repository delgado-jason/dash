// Money-write contracts · refusals at the boundary (protection stage 4b).
//
// Rule-change gate: a deliberate change to any refusal below is ONE red test
// here, and the PR body must carry a 'Rule change: <id> — <why>' line.
// Never loosen a case to turn this green without saying so.
//
// Table-driven against the PURE validators (no database). Each case names the
// rule id, breaks one field of a valid fixture, and asserts the refusal AND a
// stable fragment of the sentence the owner reads.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateSchedule } from "../utils/validation/settlementScheduleValidation.js";
import { validateAssumptions } from "../utils/validation/assumptionsValidation.js";
import { validateObligation } from "../utils/validation/obligationValidation.js";
import { validateExpensePeriod } from "../utils/validation/expensePeriodValidation.js";
import { validateLoadCreate, validateLoadPatch, BOOKER_REQUIRED } from "../utils/validation/loadValidation.js";
import { validatePerDiemRate } from "../utils/validation/perDiemRateValidation.js";
import { validateFscSchedule } from "../utils/validation/fscScheduleValidation.js";
import { validateFuelEntryCreate, validateFuelEntryPatch } from "../utils/validation/fuelValidation.js";
import { normalizeOpsCheck, DEPOSIT_LANDED_ERROR } from "../utils/validation/opsCheckValidation.js";
import { reconcileBothReading, BOTH_ONE_READING_ERROR } from "../utils/validation/maintenanceValidation.js";
import { validateSnapshotBalances } from "../utils/validation/planSnapshotValidation.js";
import {
  validSchedule,
  validAssumptions,
  validObligation,
  validExpensePeriod,
  validDeliveredLoad,
  validSnapshotAccounts,
  validPerDiemRate,
  validFscSchedule,
  validSnapshotBalances,
} from "./fixtures.js";

// A load create needs these before any money rule is reached; the fixture
// supplies them so only the broken field can speak.
const fullLoad = (over = {}) => ({
  ...validDeliveredLoad(),
  agency_id: "3f6b2c1e-9c2b-4d0e-8a2f-1b2c3d4e5f60",
  agent_id: "4a7c3d2f-0d3c-4e1f-9b3a-2c3d4e5f6071",
  booked_by: "7d0f6a52-3a6f-4142-8e6d-5f6071829304",
  origin_city: "Dallas",
  origin_state: "TX",
  destination_city: "Tulsa",
  destination_state: "OK",
  origin_market_id: "5b8d4e30-1e4d-4f20-8c4b-3d4e5f607182",
  destination_market_id: "6c9e5f41-2f5e-4031-9d5c-4e5f60718293",
  ...over,
});

const refused = (errors, fragment) =>
  assert.ok(
    errors.some((e) => e.includes(fragment)),
    `expected a refusal containing "${fragment}", got ${JSON.stringify(errors)}`,
  );

describe("the valid fixtures pass clean", () => {
  test("fixtures · every valid synthetic object is accepted", () => {
    assert.deepEqual(validateSchedule(validSchedule()).errors, []);
    assert.deepEqual(validateAssumptions(validAssumptions()).errors, []);
    assert.deepEqual(validateObligation(validObligation()).errors, []);
    assert.deepEqual(validateExpensePeriod(validExpensePeriod()), []);
    assert.deepEqual(validateLoadCreate(fullLoad()), []);
    assert.deepEqual(validateSnapshotBalances(validSnapshotBalances(), validSnapshotAccounts()), []);
  });
});

describe("NET-06 · 2026-11-05 settlement schedule — a blank pct would zero every load's net", () => {
  const cases = [
    ["NET-06 · linehaul_pct null is refused, not read as 0", { linehaul_pct: null }, "linehaul_pct needs a number"],
    ["NET-06 · linehaul_pct '' is refused", { linehaul_pct: "" }, "a blank would zero every load's net"],
    ["NET-06 · linehaul_pct 'abc' is refused", { linehaul_pct: "abc" }, "linehaul_pct needs a number"],
    ["NET-06 · fuel_surcharge_pct null is refused", { fuel_surcharge_pct: null }, "fuel_surcharge_pct needs a number"],
    ["NET-06 · a pct above 1 is refused (bounds tightened from 2)", { accessorial_pct: 1.5 }, "accessorial_pct must be a fraction between 0 and 1"],
    ["NET-06 · a negative pct is refused", { trailer_pct: -0.1 }, "trailer_pct must be a fraction between 0 and 1"],
    ["NET-06 · linehaul_pct + trailer_pct > 1 is refused", { linehaul_pct: 0.95, trailer_pct: 0.08 }, "add to more than 1"],
  ];
  for (const [name, over, message] of cases) {
    test(name, () => {
      const { errors } = validateSchedule({ ...validSchedule(), ...over });
      refused(errors, message);
    });
  }

  test("NET-06 · the prod schedule 0.65 / 0.08 / 1 / 0.73 passes and comes back as numbers", () => {
    const { values, errors } = validateSchedule(validSchedule());
    assert.deepEqual(errors, []);
    assert.deepEqual(values, validSchedule());
  });

  test("NET-06 · a partial save judges the sum against the stored schedule", () => {
    const stored = { ...validSchedule() };
    refused(validateSchedule({ trailer_pct: 0.4 }, stored).errors, "add to more than 1");
    assert.deepEqual(validateSchedule({ trailer_pct: 0.2 }, stored).errors, []);
  });
});

describe("CASH-16 · 2026-11-04 planning assumptions — a blank must not read as $0", () => {
  const cases = [
    ["CASH-16 · fed_tax_rate 15 (a percent typed as a rate) is refused", { fed_tax_rate: 15 }, "fed_tax_rate is a fraction — 15% is 0.15"],
    ["CASH-16 · state_tax_rate 5 is refused", { state_tax_rate: 5 }, "state_tax_rate is a fraction"],
    ["CASH-16 · weekly_payroll null is refused", { weekly_payroll: null }, "weekly_payroll needs a number"],
    ["CASH-16 · weekly_revenue '' is refused", { weekly_revenue: "" }, "weekly_revenue needs a number"],
    ["CASH-16 · weekly_payroll 'abc' is refused", { weekly_payroll: "abc" }, "weekly_payroll needs a number"],
    ["CASH-16 · weekly_settlement_deductions negative is refused", { weekly_settlement_deductions: -1 }, "weekly_settlement_deductions can't be negative"],
    ["CASH-16 · tax_catchup_owed negative is refused", { tax_catchup_owed: -5 }, "tax_catchup_owed can't be negative"],
  ];
  for (const [name, over, message] of cases) {
    test(name, () => {
      const { errors } = validateAssumptions({ ...validAssumptions(), ...over });
      refused(errors, message);
    });
  }

  test("CASH-16 · financing_floor may be negative (prod holds −2318)", () => {
    assert.deepEqual(validateAssumptions({ financing_floor: -2318 }).errors, []);
  });
});

describe("CASH-16 · obligations on the money calendar", () => {
  const cases = [
    ["CASH-16 · amount 'abc' is refused", { amount: "abc" }, "amount needs a number"],
    ["CASH-16 · a negative amount is refused", { amount: -50 }, "amount can't be negative"],
    ["CASH-16 · an active bill with no day_of_month is refused", { day_of_month: null }, "an active bill needs its draft day (1–31) or the money calendar can't place it"],
    ["CASH-16 · day_of_month 32 is refused", { day_of_month: 32 }, "day_of_month must be a whole day, 1–31"],
    ["CASH-16 · is_draw && on_pl is refused", { is_draw: true, on_pl: true }, "a draw is never an operating cost — it can't also be on the P&L"],
    ["CASH-16 · a negative draft_amount is refused", { draft_amount: -1 }, "draft_amount can't be negative"],
    ["CASH-16 · an impossible payoff_date is refused", { payoff_date: "2029-02-30" }, "payoff_date must be a real YYYY-MM-DD date"],
  ];
  for (const [name, over, message] of cases) {
    test(name, () => {
      const { errors } = validateObligation({ ...validObligation(), ...over });
      refused(errors, message);
    });
  }

  test("CASH-16 · an inactive bill may have no day", () => {
    assert.deepEqual(validateObligation({ ...validObligation(), active: false, day_of_month: null }).errors, []);
  });

  test("CASH-16 · a patch that clears the day of an active stored bill is refused", () => {
    const existing = { active: true, is_draw: false, on_pl: false, day_of_month: 15 };
    refused(
      validateObligation({ day_of_month: null }, { partial: true, existing }).errors,
      "an active bill needs its draft day",
    );
    assert.deepEqual(validateObligation({ amount: 1300 }, { partial: true, existing }).errors, []);
  });
});

describe("PNL-03/04/05 · 2026-11-01 October saved NULL totals — a P&L month is whole and reconciled", () => {
  const withLines = (lines) => ({ ...validExpensePeriod(), lines });
  const cases = [
    ["PNL-05 · period_month 2026-10-15 is refused (it would create a second October)", { ...validExpensePeriod(), period_month: "2026-10-15" }, "a P&L month is the 1st — 2026-10-15 would create a second October"],
    ["PNL-05 · period_month 2026-13-01 is refused", { ...validExpensePeriod(), period_month: "2026-13-01" }, "period_month must be a real YYYY-MM-DD date"],
    ["PNL-03 · a line amount 'abc' is refused", withLines([{ category: "Fuel", amount: "abc", type: "variable", section: "cogs" }]), "needs a numeric amount"],
    ["PNL-03 · a section 'other' is refused", withLines([{ category: "Fuel", amount: 3000, type: "variable", section: "other" }]), "a P&L line is cogs, expenses or income"],
    [
      "PNL-05 · cogs lines that don't add to the file's total are refused",
      { ...validExpensePeriod(), totals: { income_total: 20000, cogs_total: 19849, expense_total: 7500.5 } },
      "Cost of goods sold lines add to $3,000.00 but the file's total says $19,849.00 — re-export the P&L",
    ],
    [
      "PNL-05 · expense lines that don't add to the file's total are refused",
      { ...validExpensePeriod(), totals: { income_total: 20000, cogs_total: 3000, expense_total: 9000 } },
      "Expense lines add to $7,500.50 but the file's total says $9,000.00 — re-export the P&L",
    ],
  ];
  for (const [name, input, message] of cases) {
    test(name, () => refused(validateExpensePeriod(input), message));
  }

  test("PNL-05 · a one-cent rounding gap is within tolerance", () => {
    const p = validExpensePeriod();
    p.totals.cogs_total = 3000.01;
    assert.deepEqual(validateExpensePeriod(p), []);
  });

  test("PNL-04 · recomputePeriodTotals keeps CASE WHEN COUNT(*) = 0 THEN NULL — a period with no lines reads unfiled, never $0", () => {
    const src = readFileSync(fileURLToPath(new URL("../services/expenseServices.js", import.meta.url)), "utf8");
    const fn = src.slice(src.indexOf("async function recomputePeriodTotals"));
    assert.ok(fn.includes("CASE WHEN COUNT(*) = 0 THEN NULL"), "the NULL-when-empty branch is gone");
    assert.equal((fn.slice(0, fn.indexOf("\n}\n")).match(/CASE WHEN COUNT\(\*\) = 0 THEN NULL/g) || []).length, 2);
  });
});

describe("ODO-05 / ODO-06 · loads — the odometer window and the delivered load", () => {
  const cases = [
    ["ODO-05 · a delivered load without odometer_end is refused", { odometer_end: null }, "a delivered load needs its end odometer and its delivery date — empty miles, the Friday accrual and break-even all read them"],
    ["ODO-05 · a delivered load without odometer_start is refused", { odometer_start: null }, "a delivered load needs its end odometer and its delivery date"],
    ["ODO-05 · a delivered load without delivery_date is refused", { delivery_date: null }, "a delivered load needs its end odometer and its delivery date"],
    ["ODO-05 · odometer_end equal to odometer_start is refused", { odometer_end: 500000 }, "odometer_end (500000) must be greater than odometer_start (500000)"],
    ["ODO-05 · odometer_end below odometer_start is refused", { odometer_end: 499000 }, "must be greater than odometer_start"],
    ["ODO-05 · a typed odometer_start of 0 is refused", { odometer_start: 0 }, "odometer_start must be greater than 0"],
    ["ODO-05 · a typed odometer_end of 0 is refused", { odometer_end: 0 }, "odometer_end must be greater than 0"],
    ["ODO-06 · fuel_surcharge −1 is refused", { fuel_surcharge: -1 }, "fuel_surcharge must be greater than or equal to 0"],
    ["ODO-06 · linehaul 0 is refused", { linehaul: 0 }, "linehaul must be greater than 0"],
  ];
  for (const [name, over, message] of cases) {
    test(name, () => refused(validateLoadCreate(fullLoad(over)), message));
  }

  test("ODO-05 · a booked load may carry no readings yet", () => {
    assert.deepEqual(
      validateLoadCreate(fullLoad({ load_status: "booked", delivery_date: undefined, odometer_start: undefined, odometer_end: undefined })),
      [],
    );
  });
});

describe("GL-106 · loads — the booker is required", () => {
  test("GL-106 · a load create without booked_by is refused with the booker sentence", () => {
    const { booked_by, ...noBooker } = fullLoad();
    assert.ok(booked_by);
    refused(validateLoadCreate(noBooker), BOOKER_REQUIRED);
    refused(validateLoadCreate(fullLoad({ booked_by: null })), BOOKER_REQUIRED);
  });

  test("GL-106 · a patch that nulls or blanks booked_by is refused with the booker sentence", () => {
    refused(validateLoadPatch({ booked_by: null }), BOOKER_REQUIRED);
    refused(validateLoadPatch({ booked_by: "  " }), BOOKER_REQUIRED);
    assert.deepEqual(validateLoadPatch({ load_number: "9100002" }), []); // untouched booker is fine
  });
});

describe("PLAN-07 / PLAN-08 · snapshots — a balance for every active account, once", () => {
  const accounts = validSnapshotAccounts();
  const cases = [
    [
      "PLAN-07 · a snapshot missing an active account's balance is refused",
      validSnapshotBalances().filter((b) => b.account_id !== "acct-tax"),
      "this snapshot has no balance for Tax — type it or mark the account inactive",
    ],
    [
      "PLAN-08 · a duplicate account in one snapshot is refused",
      [...validSnapshotBalances(), { account_id: "acct-ops", balance: 1 }],
      "this snapshot lists Ops twice — one balance per account",
    ],
    [
      "PLAN-07 · a balance for an account outside the plan is refused",
      [...validSnapshotBalances(), { account_id: "acct-ghost", balance: 1 }],
      "a balance names an account that isn't in your plan",
    ],
  ];
  for (const [name, balances, message] of cases) {
    test(name, () => refused(validateSnapshotBalances(balances, accounts), message));
  }

  test("PLAN-07 · an inactive account needs no balance", () => {
    const accts = accounts.map((a) => (a.account_id === "acct-vault" ? { ...a, active: false } : a));
    const balances = validSnapshotBalances().filter((b) => b.account_id !== "acct-vault");
    assert.deepEqual(validateSnapshotBalances(balances, accts), []);
  });
});

describe("GL-136 · per-diem rate rows", () => {
  const refused = (patch, fragment) => {
    const { errors } = validatePerDiemRate({ ...validPerDiemRate(), ...patch });
    assert.ok(errors.length > 0, "expected a refusal");
    assert.match(errors[0], fragment);
  };
  test("a blank date is refused", () => refused({ effective_from: "" }, /effective_from is required/));
  test("2026-02-30 is refused", () => refused({ effective_from: "2026-02-30" }, /calendar day written YYYY-MM-DD/));
  test("a blank rate is refused", () => refused({ rate: "" }, /rate is required/));
  test("a rate of 0 is refused", () => refused({ rate: 0 }, /between \$1 and \$500/));
  test("a rate of 501 is refused", () => refused({ rate: 501 }, /between \$1 and \$500/));
  test("a 201-character note is refused", () => refused({ note: "x".repeat(201) }, /longer than 200/));
  test("a valid row passes with coerced values", () => {
    const { values, errors } = validatePerDiemRate({ effective_from: "2026-10-01", rate: "86", note: " IRS FY2027 " });
    assert.deepEqual(errors, []);
    assert.deepEqual(values, { effective_from: "2026-10-01", rate: 86, note: "IRS FY2027" });
  });
  test("a partial patch passes", () => {
    const { values, errors } = validatePerDiemRate({ note: "typo fixed" }, { partial: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(values, { note: "typo fixed" });
  });
});

describe("GL-154 · the fill-up tick", () => {
  const NOW = new Date("2026-11-04T20:00:00Z");
  const fill = (over = {}) => ({ fuel_date: "2026-11-03", gallons: 100, price_per_gallon: 3.5, odometer_reading: 600000, fuel_state: "TX", ...over });
  test('filled_to_top "yes" is refused with the sentence', () => {
    refused(validateFuelEntryCreate(fill({ filled_to_top: "yes" }), { now: NOW }), "filled_to_top must be true or false");
    refused(validateFuelEntryPatch({ filled_to_top: 1 }, { now: NOW }), "filled_to_top must be true or false");
  });
  test("true passes", () => assert.deepEqual(validateFuelEntryCreate(fill({ filled_to_top: true }), { now: NOW }), []));
  test("false passes", () => assert.deepEqual(validateFuelEntryCreate(fill({ filled_to_top: false }), { now: NOW }), []));
  test("absent passes (the column default stands)", () => assert.deepEqual(validateFuelEntryCreate(fill(), { now: NOW }), []));
});

describe("GL-155 · surcharge band tables", () => {
  const bad = (patch, fragment) => {
    const { errors } = validateFscSchedule({ ...validFscSchedule(), ...patch });
    refused(errors, fragment);
  };
  test("fewer than two bands is refused", () => bad({ bands: [{ low: 4, high: null, cpm: 0.5 }] }, "a surcharge table needs at least two bands"));
  test("a backwards band is refused", () =>
    bad({ bands: [{ low: 4.3, high: 4.2, cpm: 0.5 }, { low: 4.5, high: null, cpm: 0.6 }] }, "the band $4.30–$4.20 runs backwards"));
  test("overlapping bands are refused", () =>
    bad({ bands: [{ low: 4.0, high: 4.1, cpm: 0.5 }, { low: 4.05, high: 4.149, cpm: 0.6 }] }, "the bands $4.00–$4.10 and $4.05–$4.149 overlap"));
  test("$6 a mile is refused", () =>
    bad({ bands: [{ low: 4.0, high: 4.4, cpm: 0.5 }, { low: 4.5, high: null, cpm: 6 }] }, "the band $4.50 and up pays $6.00 a mile — outside $0–$5"));
  test("an open band that is not last is refused", () =>
    bad({ bands: [{ low: 4.0, high: null, cpm: 0.5 }, { low: 4.5, high: 4.6, cpm: 0.6 }] }, 'only the last band can run "and up"'));
  test("2026-02-30 is refused", () => bad({ effective_from: "2026-02-30" }, "calendar day written YYYY-MM-DD"));
  test("a valid three-band table with an and-up last band passes, sorted and numeric", () => {
    const f = validFscSchedule();
    const shuffled = { ...f, bands: [f.bands[2], { low: "4.00", high: "4.049", cpm: "0.58" }, f.bands[1]] };
    const { values, errors } = validateFscSchedule(shuffled);
    assert.deepEqual(errors, []);
    assert.deepEqual(values, f);
  });
});

describe("Q3 · the OPS NOW deposit tick", () => {
  const check = (over = {}) => ({ as_of: "2026-10-08", balance: 7309.08, ...over });
  const refusal = (fn) => { try { fn(); } catch (e) { return e.message; } return null; };
  test("true passes", () => assert.equal(normalizeOpsCheck(check({ deposit_landed: true })).deposit_landed, true));
  test("false passes", () => assert.equal(normalizeOpsCheck(check({ deposit_landed: false })).deposit_landed, false));
  test("absent is null — not asked, not a no", () => assert.equal(normalizeOpsCheck(check()).deposit_landed, null));
  test('"yes" is refused with the sentence', () =>
    assert.equal(refusal(() => normalizeOpsCheck(check({ deposit_landed: "yes" }))), DEPOSIT_LANDED_ERROR));
  test("a valid check still needs its date and balance", () => {
    assert.match(refusal(() => normalizeOpsCheck({ balance: 1, deposit_landed: true })), /YYYY-MM-DD/);
    assert.match(refusal(() => normalizeOpsCheck({ as_of: "2026-10-08", deposit_landed: true })), /balance is required/);
  });
});

describe("GL-07 · one reading for a both service", () => {
  test("both equal passes", () =>
    assert.deepEqual(reconcileBothReading({ unit: "both", odometer: 599431, trailer_hub: 599431 }).errors, []));
  test("trailer_hub is filled from the odometer", () =>
    assert.equal(reconcileBothReading({ unit: "both", odometer: 599431 }).trailer_hub, 599431));
  test("both differing is refused with the sentence", () =>
    refused(reconcileBothReading({ unit: "both", odometer: 599431, trailer_hub: 456123 }).errors, BOTH_ONE_READING_ERROR));
});
