// The intelligent cost-cut planner. When the WHOLE operation is under break-even
// (see marketPlaybook's businessUnderwater), this builds a plan to close the gap
// from YOUR OWN books — least-painful first, summing to the dollars needed, and
// honest when it can't reach without cutting your own pay. It is NOT a canned
// "fuel / per-diem / maintenance" list: every lever is one of your real expense
// categories, tiered by how much cutting it would actually hurt.

export type CutTier =
  | "off_limits" // insurance, debt/interest, permits, taxes, tolls — never cut
  | "essential" // utilities, legal, commissions — trim OVERSPEND back to normal only
  | "discretionary" // supplies, office, travel — can pare into the base
  | "deferrable" // non-safety repairs — defer a portion this month
  | "efficiency" // fuel — a small routing/idle slice only
  | "last_resort"; // payroll / your own pay — only if nothing else reaches the gap

// How deep BELOW its own baseline each tier can be cut (fraction of sustained
// spend). Overspend ABOVE baseline is always fully trimmable regardless of tier —
// that's just returning to normal. These are the knobs; keep them conservative.
export const BELOW_BASELINE: Record<CutTier, number> = {
  off_limits: 0,
  essential: 0,
  discretionary: 0.6,
  deferrable: 0.5,
  efficiency: 0.05,
  last_resort: 0.5,
};

// Least-painful → most. Overspend trim (any tier) always runs before any of these.
const TIER_ORDER: CutTier[] = ["discretionary", "deferrable", "efficiency", "last_resort"];

// Keyword auto-classification of a QuickBooks-style category name. The manual
// cuttability override (expense_category_defaults.cuttability) always wins over
// this — these idiosyncratic names (e.g. "NTP Warranty", "Max Weight") are why
// the override exists.
export const classifyCutTier = (category: string): CutTier => {
  const c = category.toLowerCase();
  if (
    /insurance|interest|\bloan|\blease|guarantor|permit|\bplates?\b|\btolls?\b|prepass|\btaxes?\b|eobr|\beld\b|ifta|2290|heavy vehicle|max weight|warranty|\bscales?\b/.test(
      c,
    )
  )
    return "off_limits";
  if (/payroll|salary|\bwages?\b|owner|\bdraw\b|benefit/.test(c)) return "last_resort";
  if (/fuel|diesel/.test(c)) return "efficiency";
  if (/repair|maintenance|\btire/.test(c)) return "deferrable";
  if (/utilit|legal|account|commission/.test(c)) return "essential";
  return "discretionary";
};

// Resolve a category's tier: the manual override if present, else auto-classify.
export const resolveCutTier = (category: string, override?: CutTier | null): CutTier =>
  override ?? classifyCutTier(category);

export interface CutCategory {
  category: string;
  current: number; // latest month's spend
  baseline: number; // trailing average spend
  tier: CutTier;
}

export interface CutLever {
  category: string;
  tier: CutTier;
  kind: "overspend" | "trim" | "last_resort";
  amount: number; // dollars to cut
  reason: string;
}

export interface CutPlan {
  gapNeeded: number;
  levers: CutLever[];
  planTotal: number;
  reachesGap: boolean; // the painless+deferrable+efficiency levers cover the gap
  shortfall: number; // dollars still short after every available lever
  lastResortUsed: boolean; // the plan had to touch your own pay
  offLimits: string[]; // categories the plan will never cut
}

// Build the planner's category list from the raw cut-tier rows, resolving each
// tier (manual override if set, else auto-classified from the name).
export const toCutCategories = (
  rows: { category: string; current: number; baseline: number; cuttability?: CutTier | null }[],
): CutCategory[] =>
  rows.map((r) => ({
    category: r.category,
    current: r.current,
    baseline: r.baseline,
    tier: resolveCutTier(r.category, r.cuttability ?? null),
  }));

export interface CutLine {
  category: string;
  tier: CutTier;
  amount: number;
  reason: string;
}

// Merge a plan's levers so each category is one line (the overspend trim and the
// into-the-base cut combined), preserving plan order. All levers for a category
// share its tier, so the merged line's tier is unambiguous. For the panel.
export const consolidateLevers = (levers: CutLever[]): CutLine[] => {
  const order: string[] = [];
  const byCat = new Map<string, { tier: CutTier; amount: number; kinds: Set<string>; reason: string }>();
  for (const l of levers) {
    const e = byCat.get(l.category);
    if (e) {
      e.amount += l.amount;
      e.kinds.add(l.kind);
    } else {
      order.push(l.category);
      byCat.set(l.category, { tier: l.tier, amount: l.amount, kinds: new Set([l.kind]), reason: l.reason });
    }
  }
  return order.map((category) => {
    const e = byCat.get(category)!;
    const reason =
      e.kinds.has("overspend") && (e.kinds.has("trim") || e.kinds.has("last_resort"))
        ? "trim the overspend + pare into the base"
        : e.reason;
    return { category, tier: e.tier, amount: e.amount, reason };
  });
};

const usd = (x: number): string => `$${Math.round(x).toLocaleString("en-US")}`;

const reasonFor = (tier: CutTier, months: number): string => {
  switch (tier) {
    case "discretionary":
      return "discretionary overhead — pare back";
    case "deferrable":
      return "defer the non-safety portion this month";
    case "efficiency":
      return "tighten routing / idle (~5%)";
    case "last_resort":
      return "last resort — your own pay";
    default:
      return `${months}-mo normal`;
  }
};

// Build the plan. Pure: your tiered categories + the monthly gap in, an ordered,
// gap-balanced plan out. Stops as soon as the running total meets the gap, so the
// last lever is only cut by what's still needed.
export const buildCutPlan = (
  cats: CutCategory[],
  gapNeeded: number,
  baselineMonths = 6,
): CutPlan => {
  const offLimits = cats.filter((c) => c.tier === "off_limits").map((c) => c.category);
  const levers: CutLever[] = [];
  let remaining = Math.max(0, gapNeeded);

  const take = (avail: number): number => {
    const amt = Math.min(Math.max(0, avail), remaining);
    remaining -= amt;
    return amt;
  };

  // 1) Overspend trim — the safest dollars: any category (except off-limits and
  //    last-resort pay) running above its own baseline, trimmed back to normal.
  const overspenders = cats
    .filter((c) => c.tier !== "off_limits" && c.tier !== "last_resort")
    .map((c) => ({ c, over: Math.max(0, c.current - c.baseline) }))
    .filter((x) => x.over > 0.5)
    .sort((a, b) => b.over - a.over);
  for (const { c, over } of overspenders) {
    if (remaining <= 0.5) break;
    const amount = take(over);
    if (amount > 0.5)
      levers.push({
        category: c.category,
        tier: c.tier,
        kind: "overspend",
        amount,
        reason: `running ${usd(over)} over your ${baselineMonths}-mo normal — trim to baseline`,
      });
  }

  // 2) Below-baseline cuts, tier by tier, least painful first.
  for (const tier of TIER_ORDER) {
    if (remaining <= 0.5) break;
    const frac = BELOW_BASELINE[tier];
    if (frac <= 0) continue;
    const inTier = cats
      .filter((c) => c.tier === tier)
      .map((c) => ({
        c,
        // Other tiers had their overspend trimmed in step 1, so here they only cut
        // into the baseline. last_resort (pay) was held out of step 1 — so when we
        // finally reach it, it can pull a pay SPIKE back to normal AND cut a slice
        // of the baseline, i.e. down to (1 − frac) of normal.
        avail:
          tier === "last_resort"
            ? Math.max(0, c.current - c.baseline) + Math.min(c.current, c.baseline) * frac
            : Math.min(c.current, c.baseline) * frac,
      }))
      .filter((x) => x.avail > 0.5)
      .sort((a, b) => b.avail - a.avail);
    for (const { c, avail } of inTier) {
      if (remaining <= 0.5) break;
      const amount = take(avail);
      if (amount > 0.5)
        levers.push({
          category: c.category,
          tier,
          kind: tier === "last_resort" ? "last_resort" : "trim",
          amount,
          reason: reasonFor(tier, baselineMonths),
        });
    }
  }

  const planTotal = levers.reduce((s, l) => s + l.amount, 0);
  return {
    gapNeeded,
    levers,
    planTotal,
    reachesGap: remaining <= 0.5,
    shortfall: Math.max(0, remaining),
    lastResortUsed: levers.some((l) => l.kind === "last_resort"),
    offLimits,
  };
};
