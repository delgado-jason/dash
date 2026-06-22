// Operational targets / thresholds for dashboard profitability lenses.
// IMPORTANT: BREAK_EVEN_RPM must be your all-in COST per mile (from CPM analysis),
// NOT a revenue figure. RPM above this = profitable; below = losing money.
export const BREAK_EVEN_RPM = 2.96; // TODO: confirm this is cost-per-mile, not revenue RPM

// Deadhead target: fraction of miles that are empty. Lower is better.
export const DEADHEAD_TARGET = 0.2; // 20%
