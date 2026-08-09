import { useEffect, useState } from "react";
import { useLoads } from "@/hooks/useLoads";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import {
  getRecentLoads,
  getRegionRollup,
  getLanesSummary,
  getAreaMapData,
  getAreaDetail,
  levelForWindow,
} from "@/lib/metrics/lanes";
import { LanesKpis } from "@/components/lanes/LanesKpis";
import { LanesMapBoard } from "@/components/lanes/LanesMapBoard";
import { LanesTable } from "@/components/lanes/LanesTable";
import { StateDetailPanel } from "@/components/lanes/StateDetailPanel";
import type { MapMode } from "@/components/lanes/mapColor";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardsSkeleton, BlockSkeleton } from "@/components/ui/PageSkeletons";

const WINDOWS = [30, 60, 90];

// Night Cab segmented control (the statusbar owns window + shade mode,
// per the approved Lanes mockup).
const Seg = <T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) => (
  <div
    className="inline-flex h-[30px] p-[3px] rounded-[9px] bg-well gap-[2px]"
    style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}
    role="tablist"
    aria-label={ariaLabel}
  >
    {options.map((o) => (
      <button
        key={String(o.value)}
        role="tab"
        aria-selected={value === o.value}
        onClick={() => onChange(o.value)}
        className={`px-3 rounded-md font-condensed font-semibold text-[12.5px] tracking-[.05em] transition-colors ${
          value === o.value
            ? "bg-amber text-canvas"
            : "text-dim hover:text-ink"
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const LanesPage = () => {
  const [refreshKey] = useState(0);
  const [windowDays, setWindowDays] = useState(90);
  const [mode, setMode] = useState<MapMode>("rate");
  const [selected, setSelected] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<SettlementSchedule | null>(null);
  const { loads, isLoading, error } = useLoads(refreshKey);

  useEffect(() => {
    getSettlementSchedule().then(setSchedule).catch(() => {});
  }, []);

  if (isLoading)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-8 w-28 mb-6" />
        <StatCardsSkeleton count={3} />
        <BlockSkeleton className="h-80 mt-6" />
        <BlockSkeleton className="h-56 mt-6" />
      </div>
    );

  if (error)
    return (
      <div className="p-6 text-ink font-body">
        <p className="text-destructive">{error}</p>
      </div>
    );

  // The tab drives both the time window and the map's spatial granularity:
  // 30d → macro-regions, 60d → freight regions, 90d → states. Coarser on the
  // sparser window so it still reads; finer once there's data to justify it.
  const level = levelForWindow(windowDays);
  const windowLoads = getRecentLoads(loads, windowDays);
  const rollup = getRegionRollup(windowLoads);
  const summary = getLanesSummary(windowLoads);
  const mapData = getAreaMapData(loads, windowDays, level);
  const freeHours = schedule?.detention_free_hours ?? 3;
  const detail = selected
    ? getAreaDetail(loads, level, selected, freeHours, windowDays)
    : null;

  const levelWord =
    level === "macro"
      ? "macro-regions"
      : level === "region"
        ? "freight regions"
        : "states";

  // Full-bleed per the mockup: canvas to the top, controls in the statusbar.
  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[18px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">
            LANES
          </h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            last {windowDays} days · {levelWord}
          </span>
          <span className="flex-1" />
          <Seg
            ariaLabel="Lane window"
            options={WINDOWS.map((w) => ({ value: w, label: `${w}d` }))}
            value={windowDays}
            onChange={(w) => {
              setWindowDays(w);
              setSelected(null); // a state/region key won't exist at the new level
            }}
          />
          <Seg
            ariaLabel="Shade mode"
            options={[
              { value: "volume" as MapMode, label: "Volume" },
              { value: "rate" as MapMode, label: "Rate" },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>

        <div className="mt-4">
          <LanesKpis summary={summary} />
        </div>

        <div className="mt-4">
          <LanesMapBoard
            data={mapData}
            level={level}
            windowDays={windowDays}
            selected={selected}
            onSelect={setSelected}
            mode={mode}
            onModeChange={setMode}
            windowLoads={windowLoads}
          />
        </div>

        {detail ? (
          <StateDetailPanel
            detail={detail}
            windowDays={windowDays}
            onClear={() => setSelected(null)}
          />
        ) : (
          <div className="ds2-board mt-4 p-4">
            <p className="text-xs text-faint mb-2">
              By region · last {windowDays} days · expand a market for its
              lanes · or click the map to drill in
            </p>
            <LanesTable rollup={rollup} />
          </div>
        )}
      </div>
    </div>
  );
};

export default LanesPage;
