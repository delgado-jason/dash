// CONST-01 (backend twin) · the pinned business defaults.
//
// Rule-change gate: a deliberate change to any value below is ONE red test
// here, and the PR body must carry a 'Rule change: <id> — <why>' line.
// Never "fix" a golden number to turn this green without saying so.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULTS } from "../services/settlementScheduleServices.js";

test("CONST-01 · the settlement-schedule defaults are pinned", () => {
  assert.deepEqual(
    {
      settlement_day: DEFAULTS.settlement_day,
      deposit_lag_days: DEFAULTS.deposit_lag_days,
      detention_free_hours: DEFAULTS.detention_free_hours,
      hometime_threshold_days: DEFAULTS.hometime_threshold_days,
    },
    {
      settlement_day: 3,
      deposit_lag_days: 1,
      detention_free_hours: 3,
      hometime_threshold_days: 42,
    },
  );
});

// GL-136 (2026-11-07): the rate lives in per_diem_rates, dated — Rule change: GL-136
test("CONST-01 · the settlement-schedule defaults carry no per_diem_rate", () => {
  assert.equal("per_diem_rate" in DEFAULTS, false);
});

// NET-01 (2026-11-08): the split lives in settlement_splits, dated — Rule change: NET-01
test("CONST-01 · the settlement-schedule defaults carry none of the four split pcts", () => {
  for (const f of ["linehaul_pct", "trailer_pct", "fuel_surcharge_pct", "accessorial_pct"])
    assert.equal(f in DEFAULTS, false, f);
});

// The plan's maintenance_per_mile default is a database default (migration
// 083), not JS, so it is pinned by reading the migration text.
test("CONST-01 · the plan's maintenance_per_mile default is 0.32", () => {
  const sql = readFileSync(
    fileURLToPath(new URL("../../db/migrations/083_money_calendar.sql", import.meta.url)),
    "utf8",
  );
  assert.match(sql, /maintenance_per_mile\s+numeric\s+NOT NULL\s+DEFAULT\s+0\.32\b/);
});
