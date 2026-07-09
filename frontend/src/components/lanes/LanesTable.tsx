import { Fragment, useState } from "react";
import type { RegionStat } from "@/lib/metrics/lanes";
import { MIN_KPI_LOADS } from "@/lib/metrics/lanes";
import { fmtRpm, rpmTextClass } from "./rpmStyle";

interface Props {
  rollup: RegionStat[];
}

const toggle = (set: Set<string>, key: string): Set<string> => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

export const LanesTable = ({ rollup }: Props) => {
  const [openRegions, setOpenRegions] = useState<Set<string>>(new Set());
  const [openMarkets, setOpenMarkets] = useState<Set<string>>(new Set());

  if (rollup.length === 0)
    return (
      <p className="text-muted-text text-sm py-6 text-center">
        No delivered loads in this window.
      </p>
    );

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-muted-text text-xs text-left">
          <th className="py-2 px-2 font-normal">Region / market / lane</th>
          <th className="py-2 px-2 font-normal text-right w-20">Loads</th>
          <th className="py-2 px-2 font-normal text-right w-24">Avg RPM</th>
        </tr>
      </thead>
      <tbody>
        {rollup.map((region) => {
          const rOpen = openRegions.has(region.region);
          return (
            <Fragment key={region.region}>
              <tr
                className="bg-plate border-t border-steel cursor-pointer font-semibold"
                onClick={() => setOpenRegions((s) => toggle(s, region.region))}
              >
                <td className="py-2 px-2">
                  <i
                    className={`ti ti-chevron-${rOpen ? "down" : "right"}`}
                    aria-hidden="true"
                  />{" "}
                  {region.region}
                </td>
                <td className="py-2 px-2 text-right">{region.loadCount}</td>
                <td className={`py-2 px-2 text-right ${rpmTextClass(region.avgRpm)}`}>
                  {fmtRpm(region.avgRpm)}
                </td>
              </tr>
              {rOpen &&
                region.markets.map((market) => {
                  const mKey = `${region.region}|${market.market}`;
                  const mOpen = openMarkets.has(mKey);
                  return (
                    <Fragment key={mKey}>
                      <tr
                        className="cursor-pointer text-muted-text"
                        onClick={() => setOpenMarkets((s) => toggle(s, mKey))}
                      >
                        <td className="py-2 pl-7 pr-2">
                          <i
                            className={`ti ti-chevron-${mOpen ? "down" : "right"}`}
                            aria-hidden="true"
                          />{" "}
                          {market.market}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {market.loadCount}
                        </td>
                        <td
                          className={`py-2 px-2 text-right ${rpmTextClass(market.avgRpm)}`}
                        >
                          {fmtRpm(market.avgRpm)}
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
                            <td className="py-1.5 pl-12 pr-2 text-xs border-l-2 border-amber bg-iron">
                              {lane.lane}
                            </td>
                            <td className="py-1.5 px-2 text-right text-xs bg-iron">
                              {lane.loadCount}
                            </td>
                            <td
                              className={`py-1.5 px-2 text-right text-xs bg-iron ${rpmTextClass(lane.avgRpm)}`}
                            >
                              {fmtRpm(lane.avgRpm)}
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
