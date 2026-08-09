import { lazy, Suspense, useMemo } from "react";
import type { Load } from "@/types/load";
import type { AreaMapDatum, MapLevel } from "@/lib/metrics/lanes";
import { LanesMap } from "@/components/lanes/LanesMap";
import {
  VOL_RAMP,
  RATE_RAMP,
  type MapMode,
} from "@/components/lanes/mapColor";
import { buildFlows } from "./map3d/geometry";

// The situation board's front door. WebGL machines get the R3F board
// (lazy chunk — three never rides in the main bundle); everything else gets
// the SVG board. That's a hardware capability check, not a motion
// preference — motion itself always plays.
const LanesMap3D = lazy(() => import("./map3d/LanesMap3D"));

const webglOK = (): boolean => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};

interface Props {
  data: Record<string, AreaMapDatum>;
  level: MapLevel;
  windowDays: number;
  selected: string | null;
  onSelect: (key: string) => void;
  mode: MapMode;
  onModeChange: (m: MapMode) => void;
  windowLoads: Load[];
}

export const LanesMapBoard = ({
  data,
  level,
  windowDays,
  selected,
  onSelect,
  mode,
  onModeChange,
  windowLoads,
}: Props) => {
  const gl = useMemo(webglOK, []);
  const flows = useMemo(() => buildFlows(windowLoads), [windowLoads]);

  const levelWord =
    level === "macro"
      ? "macro-regions"
      : level === "region"
        ? "freight regions"
        : "states";
  const ramp = mode === "volume" ? VOL_RAMP : RATE_RAMP;

  if (!gl)
    return (
      <LanesMap
        data={data}
        level={level}
        windowDays={windowDays}
        selected={selected}
        onSelect={onSelect}
        mode={mode}
        onModeChange={onModeChange}
      />
    );

  return (
    <div className="ds2-board p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="ds2-label">Where the freight lives</span>
        <span className="text-[11px] text-faint">
          grouped by {levelWord} · hover for numbers · click to drill in
        </span>
        <span className="ml-auto flex items-center gap-[5px] text-[10px] text-faint">
          <span>{mode === "volume" ? "fewer" : "lower $/mi"}</span>
          {ramp.map((c) => (
            <span
              key={c}
              className="w-4 h-2 rounded-[2px]"
              style={{ background: c }}
            />
          ))}
          <span>{mode === "volume" ? "more" : "higher"}</span>
        </span>
      </div>
      <div className="ds2-well mt-3 overflow-hidden">
        <Suspense
          fallback={
            <div
              className="flex items-center justify-center text-[11px] text-faint"
              style={{ height: "min(58vh, 560px)" }}
            >
              spinning up the board…
            </div>
          }
        >
          <LanesMap3D
            data={data}
            level={level}
            windowDays={windowDays}
            selected={selected}
            onSelect={onSelect}
            mode={mode}
            flows={flows}
          />
        </Suspense>
      </div>
      <div className="flex gap-4 flex-wrap pt-2.5 text-[10.5px] text-faint">
        <span>
          <b className="text-dim">Height</b> — loads in the window
        </span>
        <span>
          <b className="text-dim">Arcs</b> — your lanes, pulse = a load moving
        </span>
        <span>
          <b className="text-dim">Ring</b> — top-paying markets
        </span>
      </div>
    </div>
  );
};
