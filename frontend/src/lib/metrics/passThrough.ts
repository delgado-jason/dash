// What permits and escorts really cost you, and what a load has to pay to
// cover them.
//
// ──────────────────────────────────────────────────────────────────────────
// WHY THERE IS A GROSS-UP, PROVED FROM THE SETTLEMENTS
//
// Jason's description of what he SEES is right: the permit and escort charge
// comes out of the linehaul before Landstar splits it. The half that is easy
// to miss is that the money paid back for it is split 65/8 as well — it is not
// returned at 100%.
//
// Load 7059883 (Abbeville SC → Gainesville VA, 156" wide), reconstructed from
// settlement_lines:
//
//   booked gross, from the first pay lines at 73%      $6,835.08
//   linehaul basis after the permit/escort shuffle     $5,112.50
//   the basis therefore gave up                        $1,722.58
//   paid back: tractor $1,093.67 + trailer $134.61     $1,228.28
//     the tractor's share of that is 89.04%, = 65 ÷ 73 — a split line, not a
//     pass-through, which is the signature. Implied charge $1,682.58.
//   his actual escort + permit bill                    $1,235.43
//
// The load gave up $1,722.58 of gross to cover a $1,235.43 bill: ×1.394, which
// is 1 ÷ 0.717. That is the gross-up, printed on his own statement.
//
// It collapses to one identity. If the deducted charge comes back at the same
// 73%, the shuffle cannot change what he receives — he simply gets 73% of the
// booked gross and pays the bills himself:
//
//   load 3656664   73% of booked $3,020.16   received $3,020.89   gap $0.73
//   load 7059883   73% of booked $4,989.61   received $4,960.41   gap −$29.20
//                  (= 0.73 × a single unmatched $40.01 line)
//
// So: net = take × gross − cost, and to stay whole on a cost C the load must
// carry C ÷ take of extra gross. `passThroughAsk` is that one division, and
// the comment is this long because the conclusion reversed twice before the
// settlements settled it.
//
// THE OTHER TREATMENT EXISTS TOO. Load 1264478 carries `PERMITS 150.00 100.0%`
// — tractor only, no split, paid in full. Three of Jason's four permitted
// loads went through the 73% split and one went through whole, so the Scorer
// defaults to the gross-up (under-asking cannot be recovered; over-asking is
// negotiable) and shows the 100% figure alongside as the better case.
// ──────────────────────────────────────────────────────────────────────────

/** What you pay out of pocket on a permitted load. */
export interface PassThroughCost {
  permits: number;
  escorts: number;
  total: number;
}

export interface PassThroughInput {
  /** States you need a permit for. */
  permitCount: number | null;
  /** How many escort vehicles. */
  escortCount: number | null;
  /** LOADED miles — escorts meet you at the pickup, they never ride the deadhead. */
  loadedMiles: number | null;
  /** Settings: your average cost of one state permit. */
  permitCostUsd: number | null;
  /** Settings: cost per escort per loaded mile. */
  escortCostPerLoadedMile: number | null;
}

const n = (v: number | null | undefined): number =>
  v != null && Number.isFinite(v) && v > 0 ? v : 0;

/**
 * The bills you will actually pay. Zero in every slot you have not configured
 * or not entered — an unset permit cost cannot invent a charge.
 */
export const passThroughCost = (i: PassThroughInput): PassThroughCost => {
  const permits = n(i.permitCount) * n(i.permitCostUsd);
  const escorts = n(i.escortCount) * n(i.escortCostPerLoadedMile) * n(i.loadedMiles);
  return { permits, escorts, total: permits + escorts };
};

/**
 * The extra GROSS a load must carry so a pass-through cost leaves you whole.
 *
 * `take` is the share of linehaul you keep (0.73 for Jason: 65% linehaul + 8%
 * flatbed). A take of 1 or more — own authority, or a charge billed at a true
 * 100% like load 1264478 — means the cost passes through untouched and the ask
 * is the cost itself.
 *
 * Returns null when there is no usable take, rather than silently dividing by
 * something meaningless.
 */
export const passThroughAsk = (cost: number, take: number | null): number | null => {
  if (cost <= 0) return 0;
  if (take == null || take <= 0) return null;
  return take >= 1 ? cost : cost / take;
};

/**
 * What asking for the gross-up costs you, versus the same charge billed at a
 * true 100% pass-through. The number worth a phone call to the agency.
 */
export const grossUpPremium = (cost: number, take: number | null): number | null => {
  const ask = passThroughAsk(cost, take);
  return ask == null ? null : ask - cost;
};

/**
 * The rate per DRIVEN mile that actually pays you, once the pass-throughs are
 * taken out of the offer.
 *
 * A permitted load's headline is close to fiction without this: $7,800 over
 * 750 driven miles reads $10.40, and with $3,452 of grossed-up escorts and
 * permits inside it what reaches you is $5.80. The Scorer grades THIS number,
 * which is also what the settlement statement will show.
 */
export const rateNetOfPassThrough = (
  rate: number | null,
  passThroughGross: number | null,
): number | null => (rate == null ? null : Math.max(0, rate - (passThroughGross ?? 0)));
