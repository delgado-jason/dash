import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Load } from "@/types/load";
import {
  getRecentLoads,
  getRegionRollup,
  getLanesSummary,
  getAreaMapData,
  getLoadTypeMix,
  getTopOrigin,
  levelForWindow,
  type LaneStat,
} from "@/lib/metrics/lanes";
import { LanesMap } from "@/components/lanes/LanesMap";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { money, rpm as fmtRpm } from "@/lib/format";

const C = { background: "#0f1622", border: "1px solid #26304a" } as const;
const TILE = { background: "#121a27", border: "1px solid #26304a" } as const;
const WINDOWS = [30, 60, 90];
// oversize forced to amber (his specialty); the rest cycle a steel/cyan/violet set.
const MIX_COLORS = ["#6f7b93", "#5fd0e0", "#a06ad0", "#5f7fd0"];
const mixColor = (type: string, i: number) =>
  /over/i.test(type) ? "#e8940a" : MIX_COLORS[i % MIX_COLORS.length];

const Tile = ({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) => (
  <div className="rounded-xl px-3.5 py-3" style={TILE}>
    <p className="text-[9.5px] uppercase tracking-wide text-muted-text">{label}</p>
    <p className="text-[15px] font-bold mt-0.5 leading-tight truncate" style={{ color }}>{value}</p>
    <p className="text-[10px] text-muted-text mt-0.5 truncate">{sub}</p>
  </div>
);

export const LanesTab = ({ loads }: { loads: Load[] }) => {
  const navigate = useNavigate();
  const [windowDays, setWindowDays] = useState(90);

  const level = levelForWindow(windowDays);
  const windowLoads = useMemo(() => getRecentLoads(loads, windowDays), [loads, windowDays]);
  const mapData = useMemo(() => getAreaMapData(loads, windowDays, level), [loads, windowDays, level]);
  const summary = useMemo(() => getLanesSummary(windowLoads), [windowLoads]);
  const topOrigin = useMemo(() => getTopOrigin(mapData), [mapData]);
  const mix = useMemo(() => getLoadTypeMix(windowLoads), [windowLoads]);

  const topLanes = useMemo<LaneStat[]>(() => {
    const lanes = getRegionRollup(windowLoads).flatMap((r) => r.markets.flatMap((m) => m.lanes));
    return [...lanes].sort((a, b) => b.gross - a.gross).slice(0, 5);
  }, [windowLoads]);

  const mixTotal = mix.reduce((s, m) => s + m.gross, 0);
  const oversize = mix.find((m) => /over/i.test(m.type));
  const mixKpi = oversize ?? mix[0] ?? null;
  // top 4 slices; fold the rest into one "Other"
  const mixShown = mix.slice(0, 4);
  const mixOther = mix.slice(4).reduce((s, m) => s + m.gross, 0);

  const busy = summary.highestVolumeLane;
  const rate = summary.topRpmLane;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-condensed text-light leading-none">The lanes</h2>
          <p className="text-[11.5px] text-muted-text mt-1">where your freight runs — last {windowDays} days</p>
        </div>
        <SegmentedTabs
          ariaLabel="Lane window"
          tabs={WINDOWS.map((w) => ({ value: w, label: `${w}d` }))}
          value={windowDays}
          onChange={setWindowDays}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Tile
          label="Top origin"
          value={topOrigin ? topOrigin.key : "—"}
          sub={topOrigin ? `${money(topOrigin.gross)} · ${Math.round(topOrigin.loadShare * 100)}% of loads` : "no loads in window"}
        />
        <Tile
          label="Busiest lane"
          value={busy ? busy.lane : "—"}
          sub={busy ? `${busy.loadCount} loads · ${fmtRpm(busy.medianRpm)}/mi` : "no loads in window"}
        />
        <Tile
          label="Top $/mi lane"
          value={rate ? rate.lane : "—"}
          sub={rate ? `${fmtRpm(rate.medianRpm)} typical · ${rate.loadCount} loads` : "needs 3+ loads on a lane"}
        />
        <Tile
          label={mixKpi && /over/i.test(mixKpi.type) ? "Oversize share" : "Top load type"}
          value={mixKpi ? `${Math.round((mixKpi.gross / (mixTotal || 1)) * 100)}% of gross` : "—"}
          sub={mixKpi ? (/over/i.test(mixKpi.type) ? "your specialty" : mixKpi.type) : "no loads in window"}
          color={mixKpi && /over/i.test(mixKpi.type) ? "#e8940a" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3 items-start">
        {/* the map (real shipped component, flat for the dashboard) */}
        <div className="min-w-0">
          <LanesMap
            data={mapData}
            level={level}
            windowDays={windowDays}
            selected={null}
            onSelect={() => navigate("/lanes")}
            noir={false}
          />
        </div>

        <div className="flex flex-col gap-3">
          {/* top lanes by gross */}
          <div className="rounded-xl p-3.5 flex flex-col" style={C}>
            <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-1 flex justify-between">
              Top lanes <span className="normal-case tracking-normal font-normal">by gross · {windowDays}d</span>
            </h3>
            <div className="flex flex-col">
              {topLanes.length === 0 ? (
                <p className="text-xs text-muted-text py-4">No delivered lanes in this window.</p>
              ) : (
                topLanes.map((l) => (
                  <div key={l.lane} className="flex items-center justify-between py-[7px] text-[12px]" style={{ borderBottom: "1px solid #1a2233" }}>
                    <span className="truncate pr-2">{l.lane}</span>
                    <span className="text-muted-text whitespace-nowrap">
                      <b style={{ color: "#4ade80" }}>{money(l.gross)}</b> · {l.loadCount} · {fmtRpm(l.medianRpm)}
                    </span>
                  </div>
                ))
              )}
            </div>
            <button onClick={() => navigate("/lanes")} className="text-[11px] text-status-info-text hover:underline mt-1.5 text-left">
              All lanes →
            </button>
          </div>

          {/* load-type mix */}
          <div className="rounded-xl p-3.5 flex flex-col" style={C}>
            <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-2 flex justify-between">
              Load-type mix <span className="normal-case tracking-normal font-normal">{money(mixTotal)} gross</span>
            </h3>
            {mix.length === 0 ? (
              <p className="text-xs text-muted-text">No delivered loads in this window.</p>
            ) : (
              <>
                <div className="flex h-6 rounded-md overflow-hidden mb-2" style={{ border: "1px solid #26304a" }}>
                  {mixShown.map((m, i) => (
                    <div key={m.type} style={{ width: `${(m.gross / (mixTotal || 1)) * 100}%`, background: mixColor(m.type, i) }} title={`${m.type} ${money(m.gross)}`} />
                  ))}
                  {mixOther > 0 && <div style={{ width: `${(mixOther / (mixTotal || 1)) * 100}%`, background: "#2a3347" }} title={`Other ${money(mixOther)}`} />}
                </div>
                <div className="flex flex-col gap-0.5">
                  {mixShown.map((m, i) => (
                    <div key={m.type} className="flex items-center justify-between text-[11.5px]">
                      <span className="truncate flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-sm" style={{ background: mixColor(m.type, i) }} />
                        {m.type}
                      </span>
                      <span className="text-muted-text whitespace-nowrap">{money(m.gross)} · {Math.round(m.share * 100)}%</span>
                    </div>
                  ))}
                  {mixOther > 0 && (
                    <div className="flex items-center justify-between text-[11.5px]">
                      <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: "#2a3347" }} />Other</span>
                      <span className="text-muted-text">{money(mixOther)} · {Math.round((mixOther / (mixTotal || 1)) * 100)}%</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
