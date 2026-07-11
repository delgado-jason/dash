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

// Net operating-margin bands (P&L basis: (income − COGS − expenses) / income,
// net of Landstar). Locked with Jason against his real 6-month data + the
// owner-operator industry curve. Values are fractions of net revenue.
export const MARGIN_BANDS = { strong: 0.27, target: 0.17, minimum: 0.08 } as const;
