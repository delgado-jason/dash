import { useState } from "react";
import { useLoads } from "@/hooks/useLoads";
import {
  getRecentLoads,
  getRegionRollup,
  getLanesSummary,
  getStateMapData,
} from "@/lib/metrics/lanes";
import { LanesKpis } from "@/components/lanes/LanesKpis";
import { LanesMap } from "@/components/lanes/LanesMap";
import { LanesTable } from "@/components/lanes/LanesTable";

const WINDOWS = [30, 60, 90];

const LanesPage = () => {
  const [refreshKey] = useState(0);
  const [windowDays, setWindowDays] = useState(90);
  const { loads, isLoading, error } = useLoads(refreshKey);

  if (isLoading)
    return (
      <div className="p-6 bg-iron text-light font-body">
        <p className="text-muted-text">Loading lanes...</p>
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

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-condensed text-light">Lanes</h1>
        <div className="flex gap-1 bg-plate rounded-lg p-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindowDays(w)}
              className={`px-3 py-1 rounded text-sm ${
                windowDays === w
                  ? "bg-amber text-steel font-semibold"
                  : "text-muted-text"
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      <LanesKpis summary={summary} />

      <div className="mt-6">
        <LanesMap data={mapData} windowDays={windowDays} />
      </div>

      <div className="mt-6 bg-plate rounded-lg p-4">
        <p className="text-xs text-muted-text mb-2">
          By region · last {windowDays} days · expand a market for its lanes
        </p>
        <LanesTable rollup={rollup} />
      </div>
    </div>
  );
};

export default LanesPage;
