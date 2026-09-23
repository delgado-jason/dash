import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSnapshotExtras, monthLabel } from "./planSnapshotValidation.js";

test("a plain Friday snapshot carries nothing extra", () => {
  assert.deepEqual(normalizeSnapshotExtras({}), { miles: null, pay_week_start: null, settles_month: null });
  assert.deepEqual(normalizeSnapshotExtras({ miles: "", pay_week_start: "", settles_month: null }), {
    miles: null, pay_week_start: null, settles_month: null,
  });
});

test("the accrual: miles as a number with the pay week they covered", () => {
  assert.deepEqual(normalizeSnapshotExtras({ miles: "1999", pay_week_start: "2026-09-16" }), {
    miles: 1999, pay_week_start: "2026-09-16", settles_month: null,
  });
  assert.deepEqual(normalizeSnapshotExtras({ miles: 0, pay_week_start: "2026-09-16" }).miles, 0);
});

test("miles must be a sane number", () => {
  assert.throws(() => normalizeSnapshotExtras({ miles: "lots" }), /miles must be a number/);
  assert.throws(() => normalizeSnapshotExtras({ miles: -5 }), /miles must be a number/);
  assert.throws(() => normalizeSnapshotExtras({ miles: 250000 }), /miles must be a number/);
});

test("a pay week without miles is a mistake, not an accrual", () => {
  assert.throws(() => normalizeSnapshotExtras({ pay_week_start: "2026-09-16" }), /needs the miles/);
  assert.throws(() => normalizeSnapshotExtras({ miles: 100, pay_week_start: "Sep 16" }), /YYYY-MM-DD/);
});

test("the money day: the settled month lands as the first of the month", () => {
  assert.equal(normalizeSnapshotExtras({ settles_month: "2026-08" }).settles_month, "2026-08-01");
  assert.equal(normalizeSnapshotExtras({ settles_month: "2026-08-01" }).settles_month, "2026-08-01");
  assert.throws(() => normalizeSnapshotExtras({ settles_month: "2026-08-15" }), /first of a month/);
  assert.throws(() => normalizeSnapshotExtras({ settles_month: "2026-13-01" }), /YYYY-MM-DD/);
});

test("monthLabel names the month for the conflict message", () => {
  assert.equal(monthLabel("2026-08-01"), "August 2026");
  assert.equal(monthLabel("2026-12-01T00:00:00.000Z"), "December 2026");
});
