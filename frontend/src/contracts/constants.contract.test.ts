// CONST-01 · the pinned business constants.
//
// RULE-CHANGE GATE. Every number below is a business rule, not an
// implementation detail. A deliberate change to any pinned value is exactly
// ONE red test here, and the PR body must carry a line of the form
//   Rule change: <id> — <why>
// (the id is the rule's registry id, e.g. BASIS-01). Never edit a literal
// here just to turn the suite green without saying which rule moved.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BASIS_MONTHS,
  BREAK_EVEN_RPM,
  DEADHEAD_TARGET,
  MARGIN_GOAL,
  PAY_WEEK_START_DOW,
  SPEC_TIERS,
  STD_TIERS,
  WORKING_DAYS_PER_MONTH,
} from "@/lib/constants/targets";
import {
  DIR_THRESHOLD,
  FUEL_THRESHOLD,
  GAP_THRESHOLD,
  PRINTS_TO_HOLD,
  YVM_MIN_LOADS,
} from "@/lib/metrics/marketSignal";
import { MIN_LOADS_TO_CALL, PCTILE_EASY, PCTILE_HARD } from "@/lib/metrics/marketCall";
import { DIAL_MAX_MARGIN, DIAL_STEP } from "@/lib/metrics/rateDial";
import { IN_MIN_LOADS, OUT_MIN_LOADS } from "@/lib/metrics/marketFactor";
import { HOME_IDLE_DAYS } from "@/lib/metrics/marketLedger";
import { FUEL_WINDOW_DAYS } from "@/lib/metrics/fuelEconomy";
import { BACKWARDS_TOLERANCE_MI, IMPLAUSIBLE_WEEK_MI } from "@/lib/metrics/odometer";
import { FSC_BASE_MPG, FSC_PEG } from "@/lib/metrics/fuelRevenue";
import { MARKET_RADIUS_MI as RADIUS_RECOMMENDER } from "@/lib/metrics/marketRecommender";
import { MARKET_RADIUS_MI as RADIUS_HUBS } from "@/lib/metrics/freightHubs";
import { CDL_WARN_LEAD_DAYS } from "@/lib/metrics/compliance";
import { SOON_WITHIN_DAYS } from "@/lib/metrics/maintenance";

describe("CONST-01 · the pinned business constants", () => {
  it("every business constant equals its literal", () => {
    expect({
      // targets.ts
      BASIS_MONTHS,
      MARGIN_GOAL,
      STD_TIERS,
      SPEC_TIERS,
      WORKING_DAYS_PER_MONTH,
      PAY_WEEK_START_DOW,
      DEADHEAD_TARGET,
      // legacy — since v1.242.0 every caller passes a live ladder; only rpmStyle's fallback reads this
      BREAK_EVEN_RPM,
      // marketSignal.ts
      DIR_THRESHOLD,
      FUEL_THRESHOLD,
      PRINTS_TO_HOLD,
      YVM_MIN_LOADS,
      GAP_THRESHOLD,
      // marketCall.ts
      MIN_LOADS_TO_CALL,
      PCTILE_EASY,
      PCTILE_HARD,
      // rateDial.ts
      DIAL_STEP,
      DIAL_MAX_MARGIN,
      // marketFactor.ts
      OUT_MIN_LOADS,
      IN_MIN_LOADS,
      // marketLedger.ts
      HOME_IDLE_DAYS,
      // fuelEconomy.ts
      FUEL_WINDOW_DAYS,
      // odometer.ts
      BACKWARDS_TOLERANCE_MI,
      IMPLAUSIBLE_WEEK_MI,
      // fuelRevenue.ts
      FSC_PEG,
      FSC_BASE_MPG,
      // marketRecommender.ts
      MARKET_RADIUS_MI: RADIUS_RECOMMENDER,
      // compliance.ts
      CDL_WARN_LEAD_DAYS,
      // maintenance.ts
      SOON_WITHIN_DAYS,
    }).toEqual({
      BASIS_MONTHS: 6,
      MARGIN_GOAL: 0.26,
      STD_TIERS: { minimum: 0.1, target: 0.2, strong: 0.3 },
      SPEC_TIERS: { minimum: 0.35, target: 0.45, strong: 0.6 },
      WORKING_DAYS_PER_MONTH: 22,
      PAY_WEEK_START_DOW: 3,
      DEADHEAD_TARGET: 0.2,
      // legacy — since v1.242.0 every caller passes a live ladder; only rpmStyle's fallback reads this
      BREAK_EVEN_RPM: 2.96,
      DIR_THRESHOLD: 0.025,
      FUEL_THRESHOLD: 0.1,
      PRINTS_TO_HOLD: 2,
      YVM_MIN_LOADS: 8,
      GAP_THRESHOLD: 0.03,
      MIN_LOADS_TO_CALL: 5,
      PCTILE_EASY: 0.45,
      PCTILE_HARD: 0.7,
      DIAL_STEP: 0.02,
      DIAL_MAX_MARGIN: 0.45,
      OUT_MIN_LOADS: 4,
      IN_MIN_LOADS: 4,
      HOME_IDLE_DAYS: 7,
      // FULL_THRESHOLD (120 gal) retired 2026-11-08 — a full tank is the fill-up form's
      // filled_to_top tick, not a gallon guess (GL-154; Rule change: GL-154).
      FUEL_WINDOW_DAYS: 30,
      BACKWARDS_TOLERANCE_MI: 1000,
      IMPLAUSIBLE_WEEK_MI: 5000,
      // FSC-01 (2026-11-08): fitted from Landstar's Nov 3–9 report — Rule change: FSC-01
      FSC_PEG: 1.29,
      FSC_BASE_MPG: 5.81,
      MARKET_RADIUS_MI: 75,
      CDL_WARN_LEAD_DAYS: 45,
      SOON_WITHIN_DAYS: 30,
    });
  });

  it("MKT-12 · the two copies of MARKET_RADIUS_MI agree", () => {
    expect(RADIUS_RECOMMENDER).toBe(RADIUS_HUBS);
    expect(RADIUS_HUBS).toBe(75);
  });

  // The Pulse tab's Deadhead cell colours against DEADHEAD_TARGET, never a bare
  // 0.2 (it did until 4a, 2026-11-06 — the literal and the constant agreed by
  // luck). If the target moves, the tile moves with it.
  it("PulseTab reads DEADHEAD_TARGET, with no bare 0.2 deadhead literal", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/dashboard/PulseTab.tsx"),
      "utf8",
    );
    expect(src).toMatch(/\bDEADHEAD_TARGET\b/);
    expect(src).not.toMatch(/(?<![\d.])0\.2(?!\d)/);
  });
});
