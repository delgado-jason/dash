// Operational targets / thresholds for dashboard profitability lenses.
// BREAK_EVEN_RPM is now derived live (true cost ÷ loaded miles over the last
// BASIS_MONTHS complete months — see lib/metrics/rateTargets). This constant is
// only a fallback for when there's not enough P&L history to compute it yet.
export const BREAK_EVEN_RPM = 2.96;

// The break-even basis: the last BASIS_MONTHS complete calendar months that have
// a P&L filed. Six, not three (Jason's call on the 2026-11-01 numbers audit): a
// one-truck operation's cost per mile mostly measures miles per month — August
// ’26 ran $4.52 a mile on a home-and-shop month, September $2.54 — so three
// months swung the rate to book by a dollar a mile. Six smooths that and still
// turns within two quarters when a real cost changes.
export const BASIS_MONTHS = 6;

// Deadhead target: fraction of miles that are empty. Lower is better.
export const DEADHEAD_TARGET = 0.2; // 20%

export interface RateTiers {
  minimum: number;
  target: number;
  prime: number;
}

// Rate tiers = markup OVER the break-even rate, per driven mile — a load at
// break-even makes $0; each tier adds margin on top. TWO sets: the load
// Scorer picks by type — Specialized (oversize / hazmat / heavy haul) vs Standard
// (everything else). Seeds are calibrated from Jason's own delivered history
// (2026-07): standard freight medians ~break-even, specialized medians ~+40%.
export const STD_TIERS: RateTiers = { minimum: 0.1, target: 0.2, prime: 0.3 };
export const SPEC_TIERS: RateTiers = { minimum: 0.35, target: 0.45, prime: 0.6 };

/**
 * The profit margin a rung delivers — and it depends on NOTHING but the markup.
 *
 * At a markup `m` over break-even, gross = breakEvenGross × (1 + m). Break-even
 * gross is cost ÷ keep by definition, so net = gross × keep = cost × (1 + m),
 * and margin = (net − cost) ÷ net = m ÷ (1 + m). **The cost and the carrier's
 * keep cancel out.** That is why a rung can be labelled with its margin on any
 * page, with no basis in hand and nothing to go stale: Jason's +17.7% standard
 * minimum is a 15% margin whatever diesel does.
 *
 * This is the answer to "no misconceptions about whether a load is profitable"
 * (Jason, 2026-11-12): a word is arguable, a percentage is not.
 */
export const marginAtMarkup = (markup: number): number => markup / (1 + markup);

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
// NOTE ON THE COLUMN NAME: the rung is called `prime` in the app and
// `rate_tier_*_strong` in Postgres. The rename of 2026-11-12 deliberately
// stopped at this boundary — renaming a column is a migration against live data
// to no user-visible end, and this function is the one place the two names have
// to meet. Same for `rate_tier_spec_strong` below.
export const tiersFrom = (
  s?: {
    rate_tier_std_min?: number | null;
    rate_tier_std_target?: number | null;
    rate_tier_std_strong?: number | null;
  } | null,
): RateTiers => ({
  minimum: num(s?.rate_tier_std_min, STD_TIERS.minimum),
  target: num(s?.rate_tier_std_target, STD_TIERS.target),
  prime: num(s?.rate_tier_std_strong, STD_TIERS.prime),
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
  prime: num(s?.rate_tier_spec_strong, SPEC_TIERS.prime),
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
