import { useEffect, useState } from "react";
import { useLoads } from "@/hooks/useLoads";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import {
  getRecentLoads,
  getRegionRollup,
  getLanesSummary,
  getStateMapData,
  getStateDetail,
} from "@/lib/metrics/lanes";
import { LanesKpis } from "@/components/lanes/LanesKpis";
import { LanesMap } from "@/components/lanes/LanesMap";
import { LanesTable } from "@/components/lanes/LanesTable";
import { StateDetailPanel } from "@/components/lanes/StateDetailPanel";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardsSkeleton, BlockSkeleton } from "@/components/ui/PageSkeletons";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

const WINDOWS = [30, 60, 90];

const LanesPage = () => {
  const [refreshKey] = useState(0);
  const [windowDays, setWindowDays] = useState(90);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<SettlementSchedule | null>(null);
  const { loads, isLoading, error } = useLoads(refreshKey);

  useEffect(() => {
    getSettlementSchedule().then(setSchedule).catch(() => {});
  }, []);

  if (isLoading)
    return (
      <div className="p-6 bg-iron text-light font-body min-h-screen">
        <Skeleton className="h-8 w-28 mb-6" />
        <StatCardsSkeleton count={3} />
        <BlockSkeleton className="h-80 mt-6" />
        <BlockSkeleton className="h-56 mt-6" />
      </div>
    );

  if (error)
    return (
      <div className="p-6 bg-iron text-light font-body">
        <p className="text-destructive">{error}</p>
      </div>
    );

  // Window feeds RPM/rankings; the map applies its own 1-year footprint window.
  const windowLoads = getRecentLoads(loads, windowDays);
  const rollup = getRegionRollup(windowLoads);
  const summary = getLanesSummary(windowLoads);
  const mapData = getStateMapData(loads, windowDays);
  const freeHours = schedule?.detention_free_hours ?? 3;
  const stateDetail = selectedState
    ? getStateDetail(loads, selectedState, freeHours, windowDays)
    : null;

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-condensed text-light">Lanes</h1>
        <SegmentedTabs
          ariaLabel="Lane window"
          tabs={WINDOWS.map((w) => ({ value: w, label: `${w}d` }))}
          value={windowDays}
          onChange={setWindowDays}
        />
      </div>

      <LanesKpis summary={summary} />

      <div className="mt-6">
        <LanesMap
          data={mapData}
          windowDays={windowDays}
          selected={selectedState}
          onSelect={setSelectedState}
        />
      </div>

      {stateDetail ? (
        <StateDetailPanel
          detail={stateDetail}
          windowDays={windowDays}
          onClear={() => setSelectedState(null)}
        />
      ) : (
        <Panel noir className="mt-6 p-4">
          <p className="text-xs text-muted-text mb-2">
            By region · last {windowDays} days · expand a market for its lanes ·
            or click a state on the map
          </p>
          <LanesTable rollup={rollup} />
        </Panel>
      )}
    </div>
  );
};

export default LanesPage;
