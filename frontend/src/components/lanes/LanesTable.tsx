import { Fragment, useState } from "react";
import type { RegionStat } from "@/lib/metrics/lanes";
import { MIN_KPI_LOADS, nextHighlight } from "@/lib/metrics/lanes";
import {
  fmtPerDay,
  perDayTone,
  type DailyTargets,
  type PerDayTotals,
} from "@/lib/metrics/perDay";
import { fmtRpm, rpmTextClass, perDayTextClass } from "./rpmStyle";

interface Props {
  rollup: RegionStat[];
  // The ladder's daily break-even / target, for the $/day column's colour.
  // null until the P&L has built a cost basis — the figure still prints, it
  // just carries no verdict.
  daily: DailyTargets | null;
  // Issue #228 — the region whose states are lit on the map, and the call
  // that changes it (null = nothing lit). Optional so a caller that has no
  // map (or no interest) still gets the table.
  highlightedRegion?: string | null;
  onHighlightRegion?: (region: string | null) => void;
}

const toggle = (set: Set<string>, key: string): Set<string> => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

// The $/day cell, on the same MIN_KPI_LOADS rule the $/mi column already
// follows: under the bar the figure still prints, but it greys out — two loads
// are not enough evidence to call a corridor good or bad. The bar counts the
// loads that actually FED the figure (`totals.loads`), not the size of the
// group: a region of five loads where only two carry a pickup date has a
// two-load $/day, and it must be greyed like one.
//
// Above the bar with no verdict — the P&L has no cost basis yet, so there is
// no daily target to judge against — the cell inherits the row's own ink ("").
// Grey there would say "thin data" about a figure that is perfectly solid.
const perDayClass = (
  totals: PerDayTotals,
  daily: DailyTargets | null,
): string =>
  totals.loads < MIN_KPI_LOADS
    ? "text-muted-text"
    : perDayTextClass(perDayTone(totals.perDay, daily));

export const LanesTable = ({ rollup, daily, highlightedRegion, onHighlightRegion }: Props) => {
  const [openRegions, setOpenRegions] = useState<Set<string>>(new Set());
  const [openMarkets, setOpenMarkets] = useState<Set<string>>(new Set());

  if (rollup.length === 0)
    return (
      <p className="text-dim text-sm py-6 text-center">
        No delivered loads in this window.
      </p>
    );

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-dim text-xs text-left">
          <th className="py-2 px-2 font-normal">Region / market / lane</th>
          <th className="py-2 px-2 font-normal text-right w-20">Loads</th>
          <th className="py-2 px-2 font-normal text-right w-24">Typical $/mi</th>
          <th className="py-2 px-2 font-normal text-right w-24">Typical $/day</th>
        </tr>
      </thead>
      <tbody>
        {rollup.map((region) => {
          const rOpen = openRegions.has(region.region);
          const lit = highlightedRegion === region.region;
          return (
            <Fragment key={region.region}>
              <tr
                className={`border-t border-hairline cursor-pointer font-semibold ${
                  lit ? "bg-amber/10" : "bg-well"
                }`}
                // One click does both jobs (#228): open the region's markets
                // AND light its states on the map. The rule is `nextHighlight`
                // — opening lights this region, collapsing clears the map only
                // if THIS row is the lit one, so closing a second region can't
                // blank a map that is showing the first.
                onClick={() => {
                  const willOpen = !rOpen;
                  setOpenRegions((s) => toggle(s, region.region));
                  onHighlightRegion?.(
                    nextHighlight(willOpen, region.region, highlightedRegion ?? null),
                  );
                }}
              >
                <td className="py-2 px-2">
                  {rOpen ? (
                    <span className="text-faint mr-1" aria-hidden="true">▾</span>
                  ) : (
                    <span className="text-faint mr-1" aria-hidden="true">▸</span>
                  )}{" "}
                  {region.region}
                  {lit && (
                    <span className="ml-2 text-[10px] uppercase tracking-widest text-amber-hi font-normal">
                      on the map
                    </span>
                  )}
                </td>
                <td className="py-2 px-2 text-right">{region.loadCount}</td>
                <td className={`py-2 px-2 text-right ${rpmTextClass(region.medianRpm)}`}>
                  {fmtRpm(region.medianRpm)}
                </td>
                <td
                  className={`py-2 px-2 text-right ${perDayClass(region.perDay, daily)}`}
                >
                  {fmtPerDay(region.perDay.perDay)}
                </td>
              </tr>
              {rOpen &&
                region.markets.map((market) => {
                  const mKey = `${region.region}|${market.market}`;
                  const mOpen = openMarkets.has(mKey);
                  return (
                    <Fragment key={mKey}>
                      <tr
                        className="cursor-pointer text-dim"
                        onClick={() => setOpenMarkets((s) => toggle(s, mKey))}
                      >
                        <td className="py-2 pl-7 pr-2">
                          {mOpen ? (
                            <span className="text-faint mr-1" aria-hidden="true">▾</span>
                          ) : (
                            <span className="text-faint mr-1" aria-hidden="true">▸</span>
                          )}{" "}
                          {market.market}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {market.loadCount}
                        </td>
                        <td
                          className={`py-2 px-2 text-right ${rpmTextClass(market.medianRpm)}`}
                        >
                          {fmtRpm(market.medianRpm)}
                        </td>
                        <td
                          className={`py-2 px-2 text-right ${perDayClass(market.perDay, daily)}`}
                        >
                          {fmtPerDay(market.perDay.perDay)}
                        </td>
                      </tr>
                      {mOpen &&
                        market.lanes.map((lane) => (
                          <tr
                            key={lane.lane}
                            className={
                              lane.loadCount < MIN_KPI_LOADS ? "opacity-50" : ""
                            }
                          >
                            <td className="py-1.5 pl-12 pr-2 text-xs border-l-2 border-amber bg-[#0a0f18]">
                              {lane.lane}
                            </td>
                            <td className="py-1.5 px-2 text-right text-xs bg-[#0a0f18]">
                              {lane.loadCount}
                            </td>
                            <td
                              className={`py-1.5 px-2 text-right text-xs bg-[#0a0f18] ${rpmTextClass(lane.medianRpm)}`}
                            >
                              {fmtRpm(lane.medianRpm)}
                              {lane.avgRpm !== null && (
                                <span
                                  className="block text-[10px]"
                                  style={{ color: "var(--color-faint)" }}
                                >
                                  blended {fmtRpm(lane.avgRpm)}
                                </span>
                              )}
                            </td>
                            <td
                              className={`py-1.5 px-2 text-right text-xs bg-[#0a0f18] ${perDayClass(lane.perDay, daily)}`}
                            >
                              {fmtPerDay(lane.perDay.perDay)}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
};
