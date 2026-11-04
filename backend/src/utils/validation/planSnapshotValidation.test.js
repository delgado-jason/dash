import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeSnapshotExtras, isFirstFriday, monthLabel } from "./planSnapshotValidation.js";

// Pure — never touches a pool. The clock is pinned: Wed Nov 4, 2026, 20:00 UTC
// (the guards that were words, Nod Sheet 2026-11-04 §4 · 5); a later clock
// where a case needs the calendar to have moved on.
const NOW = new Date("2026-11-04T20:00:00Z");
const LATER = new Date("2026-11-14T20:00:00Z");
const norm = (data, now = NOW) => normalizeSnapshotExtras(data, now);
const nothing = { as_of: null, miles: null, pay_week_start: null, settles_month: null, tax_moved: null, surplus_moved: null, objective_moved: null, household_moved: null };

describe("the beats as before (#500)", () => {
  test("a plain Friday snapshot carries nothing extra", () => {
    assert.deepEqual(norm({}), nothing);
    assert.deepEqual(norm({ miles: "", pay_week_start: "", settles_month: null }), nothing);
  });
  test("the accrual: miles as a number with the pay week they covered", () => {
    assert.deepEqual(norm({ miles: "1999", pay_week_start: "2026-09-16" }), { ...nothing, miles: 1999, pay_week_start: "2026-09-16" });
    assert.equal(norm({ miles: 0, pay_week_start: "2026-09-16" }).miles, 0);
  });
  test("miles must be a sane number", () => {
    assert.throws(() => norm({ miles: "lots" }), /miles must be a number/);
    assert.throws(() => norm({ miles: -5 }), /miles must be a number/);
    assert.throws(() => norm({ miles: 250000 }), /miles must be a number/);
  });
  test("a pay week without miles is a mistake, not an accrual", () => {
    assert.throws(() => norm({ pay_week_start: "2026-09-16" }), /needs the miles/);
    assert.throws(() => norm({ miles: 100, pay_week_start: "Sep 16" }), /YYYY-MM-DD/);
  });
  test("the money day: the settled month lands as the first of the month", () => {
    assert.equal(norm({ settles_month: "2026-08" }).settles_month, "2026-08-01");
    assert.equal(norm({ settles_month: "2026-08-01" }).settles_month, "2026-08-01");
    assert.throws(() => norm({ settles_month: "2026-08-15" }), /first of a month/);
    assert.throws(() => norm({ settles_month: "2026-13-01" }), /YYYY-MM-DD/);
  });
  test("monthLabel names the month for the conflict message", () => {
    assert.equal(monthLabel("2026-08-01"), "August 2026");
    assert.equal(monthLabel("2026-12-01T00:00:00.000Z"), "December 2026");
  });
});

describe("as_of — today or earlier", () => {
  test("today passes, and so does tomorrow's UTC key (a Central evening)", () => {
    assert.equal(norm({ as_of: "2026-11-04" }).as_of, "2026-11-04");
    assert.equal(norm({ as_of: "2026-11-05" }).as_of, "2026-11-05");
  });
  test("a future date is refused with the reason — before anything else is looked at", () => {
    assert.throws(() => norm({ as_of: "2026-11-20" }), /dated today or earlier/);
    assert.throws(() => norm({ as_of: "2026-11-06", miles: 823, pay_week_start: "2026-10-28" }), /dated today or earlier/);
  });
  test("a malformed date is refused", () => {
    assert.throws(() => norm({ as_of: "11/04/2026" }), /as_of must be a YYYY-MM-DD date/);
  });
});

describe("the money day — a closed month, never the first Friday, and what it moved", () => {
  test("October settles on Wed Nov 4 with what it moved", () => {
    const out = norm({ as_of: "2026-11-04", settles_month: "2026-10", tax_moved: "0", surplus_moved: 0, objective_moved: "0", household_moved: 0 });
    assert.equal(out.settles_month, "2026-10-01");
    assert.deepEqual([out.tax_moved, out.surplus_moved, out.objective_moved, out.household_moved], [0, 0, 0, 0]);
    const sep = norm({ as_of: "2026-10-01", settles_month: "2026-09-01", tax_moved: "2,397.60", surplus_moved: 0 });
    assert.equal(sep.tax_moved, 2397.6);
    assert.equal(sep.objective_moved, null);
  });
  test("the running month is refused — it hasn't closed", () => {
    assert.throws(() => norm({ as_of: "2026-11-04", settles_month: "2026-11" }), /November 2026 hasn't closed/);
    assert.throws(() => norm({ as_of: "2026-11-04", settles_month: "2026-12-01" }), /hasn't closed/);
  });
  test("the month's first Friday is refused — Fri Nov 6, 2026; the Friday after is fine", () => {
    assert.throws(() => norm({ as_of: "2026-11-06", settles_month: "2026-10" }, LATER), /Nov 6 is the month's first Friday/);
    assert.equal(norm({ as_of: "2026-11-13", settles_month: "2026-10" }, LATER).settles_month, "2026-10-01");
  });
  test("a plain Friday snapshot on the first Friday is still fine — only the money day is barred", () => {
    assert.equal(norm({ as_of: "2026-11-06", miles: 2743, pay_week_start: "2026-10-28" }, LATER).as_of, "2026-11-06");
  });
  test("a moved amount without the month is refused; a negative or junk amount is refused", () => {
    assert.throws(() => norm({ as_of: "2026-11-04", tax_moved: 100 }), /needs the month its money day settled/);
    assert.throws(() => norm({ as_of: "2026-11-04", settles_month: "2026-10", tax_moved: -5 }), /tax_moved must be a number between 0/);
    assert.throws(() => norm({ as_of: "2026-11-04", settles_month: "2026-10", household_moved: "lots" }), /household_moved must be a number/);
  });
});

describe("isFirstFriday", () => {
  test("Nov 6, 2026 yes · Nov 13 no · Aug 7 yes · Jan 8, 2027 no", () => {
    assert.equal(isFirstFriday("2026-11-06"), true);
    assert.equal(isFirstFriday("2026-11-13"), false);
    assert.equal(isFirstFriday("2026-08-07"), true);
    assert.equal(isFirstFriday("2027-01-08"), false);
  });
});
