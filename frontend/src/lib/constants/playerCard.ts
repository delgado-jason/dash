// Career prestige ladder for the owner-operator, earned by lifetime rig miles
// (the truck's odometer — the tangible career number). Names parallel the agent
// prestige ladder so the two systems feel of a piece. Only ever climbs.
export const RANK_TIERS = [
  { key: "rookie", name: "Rookie", min: 0 },
  { key: "roadrunner", name: "Roadrunner", min: 100_000 },
  { key: "veteran", name: "Veteran", min: 300_000 },
  { key: "road-captain", name: "Road Captain", min: 500_000 },
  { key: "highway-legend", name: "Highway Legend", min: 1_000_000 },
] as const;

// The Mile Club's rungs ARE the rank ladder's rungs above Rookie (GL-151, Nod
// Sheet 2026-11-05): 100K · 300K · 500K · 1M. The Club used to put its second
// rung at 250K while Veteran sat at 300K, so one odometer read two ladders.
export const MILE_CLUB_RUNGS: readonly number[] = RANK_TIERS.slice(1).map((t) => t.min);

// Net operating-margin bands (P&L basis: (income − COGS − expenses) / income,
// net of Landstar). Locked with Jason against his real 6-month data + the
// owner-operator industry curve. Values are fractions of net revenue.
// MARGIN bands moved to lib/metrics/playerCard.marginBandsFrom — derived
// from the margin_goal setting, never hardcoded again (2026-09-02).
