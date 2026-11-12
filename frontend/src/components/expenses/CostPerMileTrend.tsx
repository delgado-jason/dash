// Cost per mile, month by month.
//
// The board quotes ONE blended cost per mile and never shows whether it is
// moving. The figures already exist — `basis.monthsDetail` carries each month's
// cost, miles and cost-per-mile — they were simply never drawn.
//
// THE FINDING THIS MAKES VISIBLE. Spending barely moves: true cost runs about
// 1.9× between the cheapest and dearest month. Miles run 4.8×. So cost per
// mile is a UTILIZATION story, not a spending one — the months over 9,000
// miles came in near $2.66 and the ones under 6,500 near $4.46. Nothing else
// on the page says that, and it is the biggest lever there is.
//
// The commitment is drawn across it as a line, because that is the mileage the
// rate floor is now derived from: a month below it is being priced off a
// promise it did not keep.
import { Panel } from "@/components/ui/Panel";
import { money, rpm as fmtRpm } from "@/lib/format";

export interface TrendMonth {
  label: string;
  cost: number;
  totalMiles: number;
  costPerTotalMile: number | null;
}

const int = (n: number): string => Math.round(n).toLocaleString("en-US");

interface Props {
  months: TrendMonth[];
  /** The committed monthly mileage, when one is set. */
  targetMiles: number | null;
}

export const CostPerMileTrend = ({ months, targetMiles }: Props) => {
  const priced = months.filter((m) => m.costPerTotalMile != null && m.totalMiles > 0);
  // Two months is a line, not a trend, and drawing one invites reading noise
  // as direction.
  if (priced.length < 3) return null;

  const rates = priced.map((m) => m.costPerTotalMile!);
  const hi = Math.max(...rates);
  const lo = Math.min(...rates);
  const miles = priced.map((m) => m.totalMiles);
  const milesHi = Math.max(...miles);
  const milesLo = Math.min(...miles);

  // The point of the panel, stated rather than left to be inferred.
  const costSpread = Math.max(...priced.map((m) => m.cost)) / Math.min(...priced.map((m) => m.cost));
  const mileSpread = milesLo > 0 ? milesHi / milesLo : null;

  const best = priced.reduce((a, b) => (b.costPerTotalMile! < a.costPerTotalMile! ? b : a));
  const worst = priced.reduce((a, b) => (b.costPerTotalMile! > a.costPerTotalMile! ? b : a));

  return (
    <Panel className="p-4 mt-4">
      <p className="ds2-label">
        Cost per mile, month by month
        <span className="ml-2 normal-case tracking-normal text-faint font-normal">
          true cost ÷ driven miles · {priced.length} months
        </span>
      </p>

      <div className="mt-2.5 divide-y ds2-cell-rule">
        {priced.map((m) => {
          const r = m.costPerTotalMile!;
          // Scaled across the observed range, not from zero: the question is
          // which months were dear and which cheap, and a zero baseline
          // flattens every month into roughly the same bar.
          const width = hi > lo ? ((r - lo) / (hi - lo)) * 86 + 14 : 100;
          const short = targetMiles != null && m.totalMiles < targetMiles;
          return (
            <div key={m.label} className="flex items-center gap-3 py-[7px]">
              <span className="font-condensed text-[13px] text-dim w-[62px] shrink-0">
                {m.label}
              </span>
              <span className="font-condensed text-[12.5px] text-faint tabular-nums w-[66px] shrink-0 text-right">
                {int(m.totalMiles)} mi
              </span>
              <span className="font-condensed text-[12.5px] text-faint tabular-nums w-[68px] shrink-0 text-right">
                {money(m.cost)}
              </span>
              <span className="flex-1 min-w-[60px]">
                <span
                  className="block h-[9px] rounded-[3px]"
                  style={{
                    width: `${width}%`,
                    background: short
                      ? "var(--color-status-negative-text)"
                      : "var(--color-status-positive-text)",
                  }}
                />
              </span>
              <b className="font-condensed text-[13.5px] tabular-nums w-[52px] shrink-0 text-right">
                {fmtRpm(r)}
              </b>
            </div>
          );
        })}
      </div>

      <p className="font-condensed text-[13px] text-dim mt-2.5 leading-snug">
        Your spending barely moves — true cost runs{" "}
        <b className="text-ink">{costSpread.toFixed(1)}×</b> between the cheapest
        and dearest month. Your miles run{" "}
        <b className="text-ink">{mileSpread == null ? "—" : `${mileSpread.toFixed(1)}×`}</b>.{" "}
        <b className="text-ink">Cost per mile is a miles story, not a spending one.</b>{" "}
        {best.label} ran {fmtRpm(best.costPerTotalMile)} on {int(best.totalMiles)} miles;{" "}
        {worst.label} ran {fmtRpm(worst.costPerTotalMile)} on {int(worst.totalMiles)}.
      </p>

      {targetMiles != null && (
        <p className="font-condensed text-[12px] text-faint mt-1.5 leading-snug">
          Months shown in red fell short of your{" "}
          <b className="text-dim">{int(targetMiles)}</b> commitment — the mileage
          your rate floor is derived from. A month below it was priced off a
          promise it did not keep.
        </p>
      )}
    </Panel>
  );
};
