// Operational targets / thresholds for dashboard profitability lenses.
// BREAK_EVEN_RPM is now derived live (true cost ÷ loaded miles over the last 3
// complete months — see lib/metrics/rateTargets). This constant is only a
// fallback for when there's not enough P&L history to compute it yet.
export const BREAK_EVEN_RPM = 2.96;

// Deadhead target: fraction of miles that are empty. Lower is better.
export const DEADHEAD_TARGET = 0.2; // 20%

export interface RateTiers {
  minimum: number;
  target: number;
  strong: number;
}

// Rate tiers = markup OVER the break-even (walk-away) rate, per driven mile — a
// load at break-even makes $0; each tier adds margin on top. TWO sets: the load
// Scorer picks by type — Specialized (oversize / hazmat / heavy haul) vs Standard
// (everything else). Seeds are calibrated from Jason's own delivered history
// (2026-07): standard freight medians ~break-even, specialized medians ~+40%.
export const STD_TIERS: RateTiers = { minimum: 0.1, target: 0.2, strong: 0.3 };
export const SPEC_TIERS: RateTiers = { minimum: 0.35, target: 0.45, strong: 0.6 };

// Back-compat default = the standard set (the app-wide baseline). Used as the
// fallback when a metric isn't handed an explicit set.
export const RATE_TIERS = STD_TIERS;

// Target profit margin (profit ÷ revenue) → the weekly/daily REVENUE targets
// (grind, recap, pace bar). Deliberately INDEPENDENT of the rate tiers: tiers
// judge a load's per-mile rate; the margin goal judges total revenue generated.
// Seed reproduces the prior +35%-over-cost target (0.35 / 1.35 ≈ 0.26).
export const MARGIN_GOAL = 0.26;

const num = (v: unknown, d: number) =>
  v != null && Number.isFinite(Number(v)) ? Number(v) : d;

// A user's saved STANDARD markup tiers (settlement schedule) → RateTiers, with
// the seed defaults filling anything missing. The app-wide baseline set.
export const tiersFrom = (
  s?: {
    rate_tier_std_min?: number | null;
    rate_tier_std_target?: number | null;
    rate_tier_std_strong?: number | null;
  } | null,
): RateTiers => ({
  minimum: num(s?.rate_tier_std_min, STD_TIERS.minimum),
  target: num(s?.rate_tier_std_target, STD_TIERS.target),
  strong: num(s?.rate_tier_std_strong, STD_TIERS.strong),
});

// The SPECIALIZED markup tiers — the Scorer uses these for oversize/hazmat/heavy.
export const specTiersFrom = (
  s?: {
    rate_tier_spec_min?: number | null;
    rate_tier_spec_target?: number | null;
    rate_tier_spec_strong?: number | null;
  } | null,
): RateTiers => ({
  minimum: num(s?.rate_tier_spec_min, SPEC_TIERS.minimum),
  target: num(s?.rate_tier_spec_target, SPEC_TIERS.target),
  strong: num(s?.rate_tier_spec_strong, SPEC_TIERS.strong),
});

// The target profit margin (0–0.95) → drives weekly/daily revenue targets.
export const marginGoalFrom = (
  s?: { margin_goal?: number | null } | null,
): number => Math.max(0, Math.min(0.95, num(s?.margin_goal, MARGIN_GOAL)));

// Gross-pace targets: working days per month for the daily rate.
export const WORKING_DAYS_PER_MONTH = 22;

// Pay week runs Wednesday → Tuesday. Day-of-week index, 0=Sun … 6=Sat.
// TODO: move to a per-user settings page (planned) so this isn't hard-coded.
export const PAY_WEEK_START_DOW = 3; // Wednesday
