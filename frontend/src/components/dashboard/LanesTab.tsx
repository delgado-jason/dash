import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { LanesMapThumb } from "@/components/lanes/LanesMapThumb";
import { Board, BoardCell } from "@/components/ui/Board";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { money, rpm as fmtRpm } from "@/lib/format";

// Option C (Jason's pick): the tab is the GLANCE — KPIs, a pure map
// thumbnail, top lanes, and the load-type mix. The situation board with its
// windows, modes, and drill-downs stays singular on /lanes.
const WINDOWS = [30, 60, 90];
// Oversize is his specialty — it always wears amber; the rest follow the
// validated fixed-order categorical set. "Other" is a neutral bucket.
const MIX_VARS = ["var(--color-cat2)", "var(--color-cat3)", "var(--color-cat5)", "var(--color-cat4)"];
const mixColor = (type: string, i: number) =>
  /over/i.test(type) ? "var(--color-cat1)" : MIX_VARS[i % MIX_VARS.length];

export const LanesTab = ({ loads }: { loads: Load[] }) => {
  const [windowDays, setWindowDays] = useState(90);

  const level = levelForWindow(windowDays);
  const windowLoads = useMemo(() => getRecentLoads(loads, windowDays), [loads, windowDays]);
  const mapData = useMemo(() => getAreaMapData(loads, windowDays, level), [loads, windowDays, level]);
  // The thumbnail always shades per-state — it's a picture, not an instrument.
  const thumbData = useMemo(() => getAreaMapData(loads, windowDays, "state"), [loads, windowDays]);
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
      <div className="flex items-center justify-end">
        <SegmentedTabs
          ariaLabel="Lane window"
          tabs={WINDOWS.map((w) => ({ value: w, label: `${w}d` }))}
          value={windowDays}
          onChange={setWindowDays}
        />
      </div>

      {/* the glance — four doors */}
      <Board className="grid grid-cols-2 md:grid-cols-4">
        <BoardCell
          className="border-b md:border-b-0 md:border-r ds2-cell-rule"
          label="Top origin"
          value={topOrigin ? topOrigin.key : "—"}
          valueClassName="text-[19px]"
          sub={
            topOrigin
              ? `${topOrigin.loadCount} load${topOrigin.loadCount === 1 ? "" : "s"} · ${windowDays}d`
              : "no delivered loads in window"
          }
          tone={topOrigin ? "amb" : "none"}
          to="/lanes"
          go="lanes"
        />
        <BoardCell
          className="border-b md:border-b-0 md:border-r ds2-cell-rule"
          label="Busiest lane"
          value={busy ? busy.lane : "—"}
          valueClassName="text-[15px] leading-snug"
          sub={busy ? `${busy.loadCount} loads · ${money(busy.gross / busy.loadCount)} avg` : "—"}
          to="/lanes"
          go="lanes"
        />
        <BoardCell
          className="md:border-r ds2-cell-rule"
          label="Top $/mi lane"
          value={rate ? rate.lane : "—"}
          valueClassName="text-[15px] leading-snug"
          sub={rate && rate.medianRpm != null ? `${fmtRpm(rate.medianRpm)}/mi median` : "—"}
          tone={rate ? "pos" : "none"}
          to="/lanes"
          go="lanes"
        />
        <BoardCell
          label={mixKpi && /over/i.test(mixKpi.type) ? "Oversize share" : "Top load type"}
          value={mixKpi ? `${Math.round(mixKpi.share * 100)}%` : "—"}
          sub={mixKpi ? `${mixKpi.type} · of ${windowDays}d gross` : "no delivered loads"}
          tone={mixKpi ? "amb" : "none"}
          to="/loads"
          go="loads"
        />
      </Board>

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-3">
        {/* Option C: pure thumbnail — one door, zero interactions */}
        <Link to="/lanes" className="ds2-board p-4 block hover:border-amber/40 transition-colors">
          <h3 className="ds2-label flex justify-between">
            Where the freight lives
            <span className="normal-case tracking-normal font-normal text-faint">
              thumbnail — the board lives on Lanes
            </span>
          </h3>
          <div className="mt-2.5">
            <LanesMapThumb data={thumbData} />
          </div>
          <span className="inline-flex mt-2 font-condensed font-semibold text-[12.5px] text-amber-hi tracking-[.05em]">
            Open the situation board →
          </span>
        </Link>

        <div className="flex flex-col gap-3 min-w-0">
          {/* top lanes by gross */}
          <Board className="p-4">
            <h3 className="ds2-label mb-1 flex justify-between">
              Top lanes{" "}
              <span className="normal-case tracking-normal font-normal text-faint">
                by gross · {windowDays}d
              </span>
            </h3>
            <div className="flex flex-col">
              {topLanes.length === 0 ? (
                <p className="text-xs text-faint py-4">No delivered lanes in this window.</p>
              ) : (
                topLanes.map((l) => (
                  <div
                    key={l.lane}
                    className="flex items-center justify-between py-[7px] text-[12px] border-b ds2-cell-rule last:border-b-0"
                  >
                    <span className="truncate pr-2 text-ink">{l.lane}</span>
                    <span className="text-faint whitespace-nowrap">
                      <b className="text-status-positive-text">{money(l.gross)}</b> · {l.loadCount} ·{" "}
                      <span className="font-condensed font-semibold text-dim tabular-nums">
                        {fmtRpm(l.medianRpm)}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </div>
            <Link
              to="/lanes"
              className="inline-block mt-2 font-condensed font-semibold text-[12.5px] text-amber-hi tracking-[.05em]"
            >
              All lanes →
            </Link>
          </Board>

          {/* load-type mix */}
          <Board className="p-4">
            <h3 className="ds2-label mb-2 flex justify-between">
              Load-type mix{" "}
              <span className="normal-case tracking-normal font-normal text-faint num">
                {money(mixTotal)} gross
              </span>
            </h3>
            {mix.length === 0 ? (
              <p className="text-xs text-faint">No delivered loads in this window.</p>
            ) : (
              <>
                <div className="flex gap-[2px] h-6 rounded-md overflow-hidden mb-2 bg-canvas">
                  {mixShown.map((m, i) => (
                    <div
                      key={m.type}
                      style={{
                        width: `${(m.gross / (mixTotal || 1)) * 100}%`,
                        background: mixColor(m.type, i),
                      }}
                      title={`${m.type} ${money(m.gross)}`}
                    />
                  ))}
                  {mixOther > 0 && (
                    <div
                      style={{
                        width: `${(mixOther / (mixTotal || 1)) * 100}%`,
                        background: "var(--color-plate-a)",
                      }}
                      title={`Other ${money(mixOther)}`}
                    />
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  {mixShown.map((m, i) => (
                    <div key={m.type} className="flex items-center justify-between text-[11.5px] text-dim">
                      <span className="truncate flex items-center gap-1.5">
                        <span
                          className="inline-block w-2 h-2 rounded-sm"
                          style={{ background: mixColor(m.type, i) }}
                        />
                        {m.type}
                      </span>
                      <span className="whitespace-nowrap font-condensed font-semibold text-ink tabular-nums">
                        {money(m.gross)} · {Math.round(m.share * 100)}%
                      </span>
                    </div>
                  ))}
                  {mixOther > 0 && (
                    <div className="flex items-center justify-between text-[11.5px] text-dim">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2 h-2 rounded-sm"
                          style={{ background: "var(--color-plate-a)" }}
                        />
                        Other
                      </span>
                      <span className="whitespace-nowrap font-condensed font-semibold text-ink tabular-nums">
                        {money(mixOther)} · {Math.round((mixOther / (mixTotal || 1)) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </Board>
        </div>
      </div>
    </div>
  );
};
