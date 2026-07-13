// Medals: tiered, FIXED universal milestones (a million miles is a million miles for
// everyone) — the aspirational career ladder, each line ending in a Trophy. Derived
// from the driver's real totals, but the thresholds don't move. Pure.

export interface Medal {
  key: string;
  name: string;
  icon: string;
  tier: number; // 0 = none yet, 1..N = current tier
  tierLabel: string; // "", "I", "II", "III"
  next: number | null; // next threshold (null = topped out / trophy next)
  progress: number; // 0..1 toward the next tier
  hint: string; // "582k / 1M"
}

export interface MedalData {
  lifetimeMiles: number;
  deliveredCount: number;
  cumulativeNet: number; // Σ delivered net
  streak: number; // grind streak, weeks
  loanPaidPct: number | null; // best % paid across tracked loans (0..1)
  seasonStrong: boolean; // season margin graded "strong"
}

const ROMAN = ["", "I", "II", "III", "IV"];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const kMi = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(0)}M` : `${Math.round(n / 1000)}k`);
const kMoney = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(0)}M` : `$${Math.round(n / 1000)}k`);

const tiered = (
  key: string,
  name: string,
  icon: string,
  tiers: number[],
  current: number,
  fmt: (n: number) => string,
): Medal => {
  let tier = 0;
  for (let i = 0; i < tiers.length; i++) if (current >= tiers[i]) tier = i + 1;
  const next = tier < tiers.length ? tiers[tier] : null;
  const prev = tier > 0 ? tiers[tier - 1] : 0;
  const progress = next != null ? clamp((current - prev) / (next - prev)) : 1;
  const hint = next != null ? `${fmt(current)} / ${fmt(next)}` : `${fmt(current)} · maxed`;
  return { key, name, icon, tier, tierLabel: ROMAN[tier], next, progress, hint };
};

export const computeMedals = (d: MedalData): Medal[] => {
  const medals: Medal[] = [
    tiered("mile-club", "Mile Club", "medal", [100_000, 250_000, 500_000, 1_000_000], d.lifetimeMiles, kMi),
    tiered("freight-hauler", "Freight Hauler", "stack-2", [100, 250, 500], d.deliveredCount, (n) => `${Math.round(n)}`),
    tiered("big-earner", "Big Earner", "coins", [250_000, 500_000, 750_000], d.cumulativeNet, kMoney),
    tiered("iron-streak", "Iron Streak", "flame", [4, 8, 12], d.streak, (n) => `${Math.round(n)} wk`),
  ];

  if (d.loanPaidPct != null)
    medals.push(
      tiered("debt-crusher", "Debt Crusher", "lock-open", [0.25, 0.5, 0.75], d.loanPaidPct, (n) => `${Math.round(n * 100)}%`),
    );

  // Strong Season — a single-tier honor (this season's margin graded strong).
  medals.push({
    key: "strong-season",
    name: "Strong Season",
    icon: "trophy",
    tier: d.seasonStrong ? 1 : 0,
    tierLabel: d.seasonStrong ? "I" : "",
    next: null,
    progress: d.seasonStrong ? 1 : 0,
    hint: d.seasonStrong ? "earned this season" : "grade a strong margin season",
  });

  return medals;
};

// Earned medals only, most prestigious first — for the card header.
export const earnedMedals = (medals: Medal[]): Medal[] =>
  medals.filter((m) => m.tier > 0).sort((a, b) => b.tier - a.tier);

// Static catalog for the Guide's award-system reference (name + the tier ladder).
export const MEDAL_GUIDE: { name: string; icon: string; tiers: string }[] = [
  { name: "Mile Club", icon: "medal", tiers: "100k · 250k · 500k · 1M mi" },
  { name: "Freight Hauler", icon: "stack-2", tiers: "100 · 250 · 500 loads" },
  { name: "Big Earner", icon: "coins", tiers: "$250k · $500k · $750k net" },
  { name: "Iron Streak", icon: "flame", tiers: "4 · 8 · 12-week streak" },
  { name: "Debt Crusher", icon: "lock-open", tiers: "25% · 50% · 75% paid off" },
  { name: "Strong Season", icon: "trophy", tiers: "a strong-margin season" },
];
