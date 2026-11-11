// What a stretch at home costs — and what moving it a week either way costs.
//
// Call 4 of "Home Time And The Forecast", and the finding the whole sheet
// turned on: Jason's bills CLUSTER. The truck note (26th), the guarantee fee
// (27th), the trailer (27th) and the phone (29th) all draft in the last week of
// the month. So the same two weeks off cost about $4,800 taken early in
// December and about $7,700 taken late — roughly three thousand dollars for the
// identical fortnight, moved. It is a decision he makes several times a year
// and nothing in dash has ever priced it.
//
// The stretch is not asked for twice: it reads the days already marked on the
// calendar above. Mark the week, see what it costs.
import { useMemo } from "react";
import type { Obligation } from "@/types/obligation";
import { payWeekOf, type PayWeek } from "@/lib/metrics/payWeeks";
import { billsIn } from "@/lib/metrics/cashBoard";
import { fortnightOptions, cheapest } from "@/lib/metrics/homePlan";
import { forgoneOverDays } from "@/lib/metrics/pace";
import { money } from "@/lib/format";
import { Panel } from "@/components/ui/Panel";

const DAY_MS = 86_400_000;
const addDays = (key: string, n: number): string =>
  new Date(new Date(`${key}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);

const md = (key: string): string =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

interface Props {
  /** The days marked home-planned on the calendar above. */
  plannedDays: string[];
  obligations: Obligation[];
  weeklyPayroll: number | null;
  /**
   * What a day with the truck moving is worth, after the fuel and wear it
   * burns. Null when the basis cannot supply it — the panel then shows only
   * the money that drafts, and says that is what it is showing.
   */
  contributionPerDayOut?: number | null;
}

export const FortnightCost = ({
  plannedDays,
  obligations,
  weeklyPayroll,
  contributionPerDayOut = null,
}: Props) => {
  const view = useMemo(() => {
    if (plannedDays.length === 0) return null;
    const sorted = [...plannedDays].map((d) => String(d).slice(0, 10)).sort();
    const first = payWeekOf(sorted[0]);
    const last = payWeekOf(sorted[sorted.length - 1]);
    // How many pay weeks the marked days span, inclusive of both ends.
    let span = 1;
    let w = first.start;
    while (w < last.start && span < 12) {
      w = addDays(w, 7);
      span++;
    }
    const weekAt = (offset: number): PayWeek => payWeekOf(addDays(first.start, offset * 7));
    const options = fortnightOptions(
      weekAt,
      span,
      weeklyPayroll,
      (week) => billsIn(obligations, week).reduce((s, b) => s + b.amount, 0),
    );
    return { options, span, best: cheapest(options) };
  }, [plannedDays, obligations, weeklyPayroll]);

  if (!view || view.options.length === 0) return null;
  const chosen = view.options.find((o) => o.shift === 0);
  if (!chosen) return null;

  // Keyed on the DAYS marked, not the weeks they span: a two-day stretch gives
  // up two days of earning even though it touches a whole pay week. It is also
  // identical across the shifted options below — the same days off forgo the
  // same contribution whichever week they land in — so it moves the total
  // without ever changing which week is cheapest. Only the bills do that.
  // Zero is a real answer from the clamp — it means a mile currently costs more
  // to run than it brings home, so a day at home forgoes nothing. True, and
  // useless to print: "earnings you give up $0" is noise, not information. The
  // panel falls back to saying it can only price the drafts.
  const forgoneRaw = forgoneOverDays(plannedDays.length, contributionPerDayOut);
  const forgone = forgoneRaw != null && forgoneRaw > 0 ? forgoneRaw : null;

  const word = view.span === 1 ? "week" : view.span === 2 ? "fortnight" : `${view.span} weeks`;
  // Only worth saying when moving actually saves something real. A few dollars
  // either way is not a reason to rearrange a fortnight at home.
  const worthMoving = view.best != null && view.best.shift !== 0 && view.best.delta <= -100;

  return (
    <Panel className="p-4 mt-4">
      <p className="ds2-label">
        What this {word} costs
        <span className="ml-2 normal-case tracking-normal text-faint font-normal">
          payroll and the bills draft wherever the truck is
        </span>
      </p>

      {/* WHAT THE STRETCH REALLY COSTS.
          The bills and payroll draft whether the truck moves or not, so they
          are not what a day at home costs you — they were leaving anyway. What
          it costs is the contribution that does not happen. On Jason's figures
          that is roughly $682 a day against about $386 of drafts, so pricing
          only the drafts showed home time at about a third of its real price. */}
      <p className="font-condensed font-semibold tabular-nums text-[26px] text-amber-hi mt-1">
        {money(forgone == null ? chosen.cost.total : chosen.cost.total + forgone)}
      </p>

      {forgone != null && (
        <div className="mt-1.5 font-condensed text-[13px] text-dim flex flex-wrap gap-x-4 gap-y-0.5">
          <span>
            <span className="text-faint">drafts anyway</span>{" "}
            <b className="text-ink tabular-nums">{money(chosen.cost.total)}</b>
          </span>
          <span>
            <span className="text-faint">+ earnings you give up</span>{" "}
            <b className="text-ink tabular-nums">{money(forgone)}</b>
            <span className="text-faint">
              {" "}
              · {plannedDays.length} {plannedDays.length === 1 ? "day" : "days"} ×{" "}
              {money(contributionPerDayOut)}
            </span>
          </span>
        </div>
      )}

      <div className="mt-2.5 divide-y ds2-cell-rule">
        {chosen.cost.weeks.map((w) => (
          <div key={w.week.start} className="flex items-baseline justify-between gap-3 py-[7px]">
            <span className="font-condensed text-[13.5px] text-dim">
              {md(w.week.start)} – {md(w.week.end)}
              {w.bills > 0 && (
                <span className="text-faint"> · bills {money(w.bills)}</span>
              )}
              <span className="text-faint"> · payroll {money(w.payroll)}</span>
            </span>
            <span className="font-condensed font-semibold tabular-nums text-[14px]">
              {money(w.out)}
            </span>
          </div>
        ))}
      </div>

      {/* The comparison is the point. A fortnight is the same fortnight
          wherever it falls — the bills are what differ. */}
      <div className="mt-2.5 pt-2.5 border-t ds2-cell-rule">
        <p className="ds2-label mb-1.5">Moved a week</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {view.options
            .filter((o) => o.shift !== 0)
            .map((o) => (
              <span key={o.shift} className="font-condensed text-[13.5px] text-dim">
                {o.shift < 0 ? "a week earlier" : "a week later"}{" "}
                <b className="tabular-nums text-ink">{money(o.cost.total)}</b>{" "}
                <span
                  className="tabular-nums"
                  style={{
                    color:
                      o.delta < 0
                        ? "var(--color-status-positive-text)"
                        : o.delta > 0
                          ? "var(--color-status-negative-text)"
                          : "var(--color-faint)",
                  }}
                >
                  {o.delta === 0 ? "same" : `${o.delta < 0 ? "−" : "+"}${money(Math.abs(o.delta))}`}
                </span>
              </span>
            ))}
        </div>
        {worthMoving && view.best && (
          <p className="font-condensed text-[13px] mt-2" style={{ color: "var(--color-status-positive-text)" }}>
            Taking it {view.best.shift < 0 ? "a week earlier" : "a week later"} saves{" "}
            <b>{money(Math.abs(view.best.delta))}</b> — the same {word}, away from the bills.
          </p>
        )}
      </div>

      <p className="font-condensed text-[12px] text-faint mt-2.5 leading-snug">
        Revenue, fuel and the fuel advance are already struck from these weeks on
        the cash board. What still drafts is {chosen.cost.weeks.length}{" "}
        {chosen.cost.weeks.length === 1 ? "week" : "weeks"} of payroll plus
        whatever bills land on those dates — and those would have drafted
        anyway.{" "}
        {forgone != null ? (
          <>
            The bigger half is the <b className="text-dim">contribution that
            does not happen</b>: what a day out earns after the fuel and wear it
            burns. Fixed cost is left out of it on purpose — it is leaving
            either way, so charging a home day for it would be counting it
            twice.
          </>
        ) : (
          <>
            This is only the money that drafts. What a day at home really costs
            is the earning that does not happen, which needs a P&amp;L month and
            some marked home days before it can be measured.
          </>
        )}
      </p>
    </Panel>
  );
};
