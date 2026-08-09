import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
        </tr>
      </thead>
      <tbody>
        {rollup.map((region) => {
          const rOpen = openRegions.has(region.region);
          return (
            <Fragment key={region.region}>
              <tr
                className="bg-well border-t border-hairline cursor-pointer font-semibold"
                onClick={() => setOpenRegions((s) => toggle(s, region.region))}
              >
                <td className="py-2 px-2">
                  {rOpen ? (
                    <ChevronDown size={14} className="inline" aria-hidden="true" />
                  ) : (
                    <ChevronRight size={14} className="inline" aria-hidden="true" />
                  )}{" "}
                  {region.region}
                </td>
                <td className="py-2 px-2 text-right">{region.loadCount}</td>
                <td className={`py-2 px-2 text-right ${rpmTextClass(region.medianRpm)}`}>
                  {fmtRpm(region.medianRpm)}
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
                            <ChevronDown size={13} className="inline" aria-hidden="true" />
                          ) : (
                            <ChevronRight size={13} className="inline" aria-hidden="true" />
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
                                  style={{ color: "#5b6b82" }}
                                >
                                  blended {fmtRpm(lane.avgRpm)}
                                </span>
                              )}
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
