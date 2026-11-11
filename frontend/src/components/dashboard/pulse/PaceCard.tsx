// Are you keeping the promise?
//
// The rate floor no longer floats with the miles you happened to drive — it is
// fixed cost spread over the miles you COMMITTED to (migration 109). That is
// only honest if something watches the commitment, and this is it.
//
// Two readouts, kept apart on purpose. "Miles per day out" ignores home time
// entirely, so a fortnight at home never makes the driving look lazy. "Lands
// at" counts the days, including the ones already marked home-planned. They
// are free to disagree — November '26 ran BELOW its own trailing pace and
// still projected OVER target, because no home days were taken, and a card
// that forced those into one number would have had to lie about one of them.
//
// THE WARNING IS NEVER A PRICE. When the month is tracking well under the
// commitment this says what floor those miles would really imply. The ladder
// keeps quoting the committed figure regardless. Chasing miles or accepting a
// thinner month is a judgement the software does not get to make.
import { Board } from "@/components/ui/Board";
import type { Pace } from "@/lib/metrics/pace";
import { rpm as fmtRpm, money } from "@/lib/format";

const int = (n: number): string => Math.round(n).toLocaleString("en-US");

interface Props {
  pace: Pace;
  /** The floor the projected mileage implies — null when it cannot be derived. */
  impliedFloor: number | null;
  /** The floor the ladder is actually quoting, for comparison. */
  committedFloor: number | null;
  /** What a day with the truck moving earns after its own fuel and wear. */
  dayWorth?: number | null;
  className?: string;
}

export const PaceCard = ({
  pace,
  impliedFloor,
  committedFloor,
  dayWorth = null,
  className = "",
}: Props) => {
  const { miles, target, pctOfTarget, daysOut, milesPerDayOut, trailingPerDayOut, landsAt } = pace;

  // Only worth warning when the gap is real money. A few cents either way is
  // noise, and a card that cries every month gets ignored — which is exactly
  // how the old floating floor lost its credibility.
  const warn =
    impliedFloor != null && committedFloor != null && impliedFloor - committedFloor >= 0.15;

  const vsTrailing =
    milesPerDayOut != null && trailingPerDayOut != null
      ? milesPerDayOut - trailingPerDayOut
      : null;

  return (
    <Board className={`p-4 ${className}`}>
      <h3 className="ds2-label flex justify-between">
        Pace
        <span className="font-condensed text-[12px] tracking-normal normal-case text-faint">
          {target == null ? "no commitment set" : `against ${int(target)} a month`}
        </span>
      </h3>

      <div className="flex items-baseline gap-2.5 mt-2">
        <span className="font-condensed font-semibold text-[30px] tabular-nums leading-none">
          {int(miles)}
        </span>
        {pctOfTarget != null && (
          <span className="font-condensed text-[13.5px] text-dim tabular-nums">
            of {int(target!)} · <b className="text-ink">{Math.round(pctOfTarget * 100)}%</b>
          </span>
        )}
      </div>

      {pctOfTarget != null && (
        <div
          className="h-[9px] rounded-[3px] mt-2.5 overflow-hidden border ds2-cell-rule"
          style={{ background: "var(--color-well)" }}
          role="img"
          aria-label={`${Math.round(pctOfTarget * 100)} percent of this month's committed miles`}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, Math.max(0, pctOfTarget * 100))}%`,
              background: "var(--color-amber)",
            }}
          />
        </div>
      )}

      <div className="mt-3 divide-y ds2-cell-rule">
        <div className="flex items-baseline justify-between gap-3 py-[7px]">
          <span className="font-condensed text-[13.5px] text-dim">
            Miles per day out
            <span className="text-faint"> · {daysOut} {daysOut === 1 ? "day" : "days"} out</span>
          </span>
          <span className="font-condensed text-[13.5px] tabular-nums">
            <b className="text-ink">{milesPerDayOut == null ? "—" : int(milesPerDayOut)}</b>
            {vsTrailing != null && Math.abs(vsTrailing) >= 1 && (
              <span
                className="text-faint"
                style={{
                  color:
                    vsTrailing >= 0
                      ? "var(--color-status-positive-text)"
                      : "var(--color-status-negative-text)",
                }}
              >
                {" "}
                {vsTrailing >= 0 ? "+" : "−"}
                {int(Math.abs(vsTrailing))}
              </span>
            )}
            {trailingPerDayOut != null && (
              <span className="text-faint"> vs {int(trailingPerDayOut)}</span>
            )}
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-3 py-[7px]">
          <span className="font-condensed text-[13.5px] text-dim">
            Lands at
            <span className="text-faint"> · {pace.daysOutLeft} more out</span>
          </span>
          <span className="font-condensed text-[13.5px] tabular-nums">
            <b
              style={{
                color:
                  landsAt == null || target == null
                    ? "var(--color-ink)"
                    : landsAt >= target
                      ? "var(--color-status-positive-text)"
                      : "var(--color-status-negative-text)",
              }}
            >
              {landsAt == null ? "—" : int(landsAt)}
            </b>
          </span>
        </div>

        {/* The companion to rate per mile, which is a ratio and so punishes a
            cheap repositioning mile even when it raises the month's profit.
            This is a total: what a moving day actually earns after its own
            fuel and wear — and therefore what a day at home gives up. */}
        {dayWorth != null && dayWorth > 0 && (
          <div className="flex items-baseline justify-between gap-3 py-[7px]">
            <span className="font-condensed text-[13.5px] text-dim">
              A day out is worth
              <span className="text-faint"> · after fuel and wear</span>
            </span>
            <span className="font-condensed text-[13.5px] tabular-nums">
              <b style={{ color: "var(--color-status-positive-text)" }}>
                {money(dayWorth)}
              </b>
            </span>
          </div>
        )}
      </div>

      {warn ? (
        <p className="font-condensed text-[12.5px] mt-2.5 leading-snug" style={{ color: "var(--color-amber-hi)" }}>
          At this pace the month lands near <b>{int(landsAt!)}</b>, where the real
          floor is <b>{fmtRpm(impliedFloor)}</b> — not the{" "}
          <b>{fmtRpm(committedFloor)}</b> the ladder quotes.{" "}
          <span className="text-faint">
            The ladder does not move on a slow month. Chase the miles or take the
            thinner month — that call is yours.
          </span>
        </p>
      ) : (
        <p className="font-condensed text-[12px] text-faint mt-2.5 leading-snug">
          {target == null ? (
            <>
              Set a monthly mileage commitment in Settings and the rate floor stops
              drifting with whatever the month happened to do.
            </>
          ) : (
            <>
              Miles per day out ignores home time — a week at home never makes the
              driving look slow. <b className="text-dim">Lands at</b> counts the
              days, planned home time included.
            </>
          )}
        </p>
      )}
    </Board>
  );
};
