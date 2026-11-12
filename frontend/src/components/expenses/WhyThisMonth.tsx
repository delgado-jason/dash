// Why this month came out where it did.
//
// Two of ten months lost money and the page rendered both the same way: a red
// margin and nothing else. They had opposite causes. October's freight did not
// come — revenue $7,736 under its usual, costs within $255 of normal. August's
// freight was nearly fine and the spending blew out $5,476. One says go book
// loads; the other says stop spending. A red number that cannot tell you which
// is a result, not a diagnosis.
//
// Two bars, because revenue and cost SUM to the month's shortfall. Miles and
// rate ride underneath as a sentence: they multiply into revenue rather than
// adding to it, so drawing them as a third bar would double-count the overlap
// and stop the arithmetic reconciling.
import { Panel } from "@/components/ui/Panel";
import { money } from "@/lib/format";
import type { MonthWhy, CategoryOutlier } from "@/lib/metrics/monthDiagnosis";

const int = (n: number): string => Math.round(n).toLocaleString("en-US");
const signed = (n: number): string => `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;

/**
 * "Close to normal" only where that is actually true: a lever that HURT, and
 * only slightly. Being merely smaller than the other lever is not the same
 * thing — October's costs came in $2,659 BETTER than usual, which is a saving,
 * not a non-event, and labelling it "close to normal" reads as both.
 */
const quiet = (mine: number, other: number): string | undefined => {
  if (mine >= 0) return undefined; // it helped — the bar says so
  const total = Math.abs(mine) + Math.abs(other);
  return total > 0 && Math.abs(mine) / total < 0.25 ? "close to normal" : undefined;
};

const tone = (v: number): string =>
  v >= 0 ? "var(--color-status-positive-text)" : "var(--color-status-negative-text)";

/** One lever: its dollars and a bar scaled against whichever lever moved most. */
const Lever = ({
  name,
  value,
  note,
  biggest,
}: {
  name: string;
  value: number;
  note?: string;
  biggest: number;
}) => (
  <div className="mt-2.5 first:mt-0">
    <p className="font-condensed text-[13.5px] text-dim">
      {name}{" "}
      <b className="tabular-nums" style={{ color: tone(value) }}>
        {signed(value)}
      </b>
      {note && <span className="text-faint"> · {note}</span>}
    </p>
    <div
      className="h-[9px] rounded-[3px] mt-1 overflow-hidden"
      style={{ background: "var(--color-well)" }}
    >
      <div
        style={{
          height: "100%",
          // A floor of 2% so a near-zero lever still reads as a lever.
          width: `${Math.max(2, (Math.abs(value) / biggest) * 100)}%`,
          background: tone(value),
        }}
      />
    </div>
  </div>
);

const WORDS: Record<MonthWhy["verdict"], { lead: string; tail: string }> = {
  revenue: {
    lead: "A freight month, not a spending month.",
    tail: "Cutting costs would not have changed it.",
  },
  cost: {
    lead: "A spending month, not a freight month.",
    tail: "The freight was close to ordinary.",
  },
  balanced: {
    lead: "Both levers moved, neither decisively.",
    tail: "No single thing to chase.",
  },
};

interface Props {
  why: MonthWhy;
  label: string;
  outliers: CategoryOutlier[];
  /** Driven miles this month and usually, when they can be measured. */
  miles: number | null;
  usualMiles: number | null;
  /** Income per driven mile, this month and usually. */
  perMile: number | null;
  usualPerMile: number | null;
}

export const WhyThisMonth = ({
  why,
  label,
  outliers,
  miles,
  usualMiles,
  perMile,
  usualPerMile,
}: Props) => {
  const down = why.shortfall < 0;
  const w = WORDS[why.verdict];

  // Bars are scaled against the LARGER lever so the smaller one reads as small.
  // Scaling each to its own width would draw a $255 miss the same size as a
  // $7,736 one, which is the confusion this panel exists to end.
  const biggest = Math.max(Math.abs(why.revenueEffect), Math.abs(why.costEffect), 1);

  return (
    <Panel className="p-4 mt-4">
      <p className="ds2-label">
        Why {label}
        <span className="ml-2 normal-case tracking-normal text-faint font-normal">
          against your usual month · {why.comparedWith} others filed
        </span>
      </p>

      <p
        className="font-condensed font-semibold tabular-nums text-[26px] mt-1"
        style={{ color: tone(why.shortfall) }}
      >
        {signed(why.shortfall)}
        <span className="text-[15px] text-faint">
          {" "}
          {down ? "below" : "above"} a usual month
        </span>
      </p>

      <div className="mt-3">
        <Lever name="Revenue" value={why.revenueEffect} biggest={biggest} note={quiet(why.revenueEffect, why.costEffect)} />
        <Lever name="Cost" value={why.costEffect} biggest={biggest} note={quiet(why.costEffect, why.revenueEffect)} />
      </div>

      {/* The revenue lever, described rather than divided — miles times rate
          is a product, and splitting it into a third bar would stop the two
          above from summing to the shortfall. */}
      {miles != null && usualMiles != null && usualMiles > 0 && (
        <p className="font-condensed text-[13px] text-dim mt-3 leading-snug">
          You drove <b className="text-ink tabular-nums">{int(miles)}</b> miles against a
          usual <b className="tabular-nums">{int(usualMiles)}</b>
          <span className="text-faint">
            {" "}
            ({Math.round((miles / usualMiles - 1) * 100)}%)
          </span>
          {perMile != null && usualPerMile != null && (
            <>
              , at <b className="text-ink tabular-nums">${perMile.toFixed(2)}</b> a mile
              against <b className="tabular-nums">${usualPerMile.toFixed(2)}</b>
            </>
          )}
          .
        </p>
      )}

      <p className="font-condensed text-[13.5px] mt-2" style={{ color: "var(--color-amber-hi)" }}>
        <b>{w.lead}</b> <span className="text-faint">{w.tail}</span>
      </p>

      {outliers.length > 0 && (
        <>
          <p className="ds2-label mt-4 mb-1.5">
            What ran over
            <span className="ml-2 normal-case tracking-normal text-faint font-normal">
              against each category&rsquo;s own history
            </span>
          </p>
          <div className="divide-y ds2-cell-rule">
            {outliers.map((o) => (
              <div key={o.category} className="flex items-baseline gap-3 flex-wrap py-[7px]">
                <span className="font-condensed text-[13.5px] min-w-[160px]">{o.category}</span>
                <span className="font-condensed text-[13.5px] tabular-nums text-dim">
                  <b className="text-ink">{money(o.amount)}</b>
                  <span className="text-faint"> vs a usual {money(o.usual)}</span>
                </span>
                <span
                  className="font-condensed font-semibold text-[13.5px] tabular-nums"
                  style={{ color: "var(--color-status-negative-text)" }}
                >
                  +{money(o.over)}
                </span>
                <span className="ml-auto shrink-0 font-condensed text-[12px] text-faint">
                  {o.sigma == null
                    ? "never varied before"
                    : `${o.sigma.toFixed(1)}× its normal swing`}
                </span>
              </div>
            ))}
          </div>
          <p className="font-condensed text-[12px] text-faint mt-2 leading-snug">
            Judged on each category&rsquo;s own spread, not on dollars. Repairs
            swing by thousands as a matter of course, so a big month for them is
            not news; a quiet category doubling is.
          </p>
        </>
      )}
    </Panel>
  );
};
