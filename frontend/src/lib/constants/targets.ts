// Operational targets / thresholds for dashboard profitability lenses.
// BREAK_EVEN_RPM is now derived live (true cost ÷ loaded miles over the last 3
// complete months — see lib/metrics/rateTargets). This constant is only a
// fallback for when there's not enough P&L history to compute it yet.
export const BREAK_EVEN_RPM = 2.96;

// Deadhead target: fraction of miles that are empty. Lower is better.
export const DEADHEAD_TARGET = 0.2; // 20%

// Rate tiers = markup OVER the break-even (walk-away) rate — a load at the
// break-even rate makes $0; each tier adds margin on top. Matches Jason's ops
// sheet (walk-away × 1.15 / 1.35 / 1.60).
export const RATE_TIERS = { minimum: 0.15, target: 0.35, strong: 0.6 } as const;

// Gross-pace targets: working days per month for the daily rate.
export const WORKING_DAYS_PER_MONTH = 22;

// Pay week runs Wednesday → Tuesday. Day-of-week index, 0=Sun … 6=Sat.
// TODO: move to a per-user settings page (planned) so this isn't hard-coded.
export const PAY_WEEK_START_DOW = 3; // Wednesday
