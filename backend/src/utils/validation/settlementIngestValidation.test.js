import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateSettlementIngest } from "./settlementIngestValidation.js";

const lines = [
  { revenue: 1000, deductions: null },
  { revenue: 500.5, deductions: 120.25 },
  { revenue: null, deductions: 10 },
];
const ok = { period_ending: "2026-11-04", revenue: 1500.5, deductions: 130.25, lines, settlement_day: 3 };

describe("validateSettlementIngest", () => {
  test("a Wednesday statement that adds up passes", () => assert.deepEqual(validateSettlementIngest(ok), []));
  test("an impossible date is refused", () => {
    assert.match(validateSettlementIngest({ ...ok, period_ending: "2026-02-30" })[0], /isn't a real calendar date/);
  });
  test("a date off the schedule's settlement day is refused, naming both days", () => {
    const e = validateSettlementIngest({ ...ok, period_ending: "2026-11-05" })[0];
    assert.match(e, /is a Thursday — your settlements land on Wednesday/);
    assert.deepEqual(validateSettlementIngest({ ...ok, period_ending: "2026-11-05", settlement_day: 4 }), []);
  });
  test("header revenue and deductions must equal the lines within $0.01", () => {
    assert.match(validateSettlementIngest({ ...ok, revenue: 1600 })[0], /revenue says \$1,600\.00 but its lines add to \$1,500\.50/);
    assert.match(validateSettlementIngest({ ...ok, deductions: 99 })[0], /deductions say \$99\.00 but its lines add to \$130\.25/);
    assert.deepEqual(validateSettlementIngest({ ...ok, revenue: 1500.51 }), []);
    assert.equal(validateSettlementIngest({ ...ok, revenue: 1500.52 }).length, 1);
  });
});
