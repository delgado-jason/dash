import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import statesTopo from "us-atlas/states-10m.json";
import type { LaneRow, LedgerRow } from "@/lib/metrics/marketLedger";
import { getStateName, statesInRegion } from "@/lib/constants/states";
import { money, rpm as fmtRpm } from "@/lib/format";
import {
  colorForRow,
  mapScale,
  metricThin,
  HATCH_ID,
  IN_RAMP,
  METRIC_LEGEND,
  RATE_RAMP,
  VOL_RAMP,
  type MapMetric,
  type MapScale,
} from "@/components/lanes/mapColor";

// The map, flat (decision 3A): real state shapes, one metric at a time, no
// WebGL and no animation. The 3-D board and its three.js/GSAP chunk are gone —
// this reads at a glance and loads in nothing.
export interface MapPin {
  city: string;
  state: string;
  lat: number;
  lng: number;
}

interface Props {
  rows: LedgerRow[];
  metric: MapMetric;
  selected: string | null;
  onSelect: (state: string | null) => void;
  showLanes: boolean;
  lanes: LaneRow[];
  pin: MapPin | null;
  // The page mirrors the hover onto the matching ledger row, and back.
  hoverRow?: (row: LedgerRow | null) => void;
  hovered?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = statesTopo as any;
const usStates = feature(
  topo,
  topo.objects.states,
) as unknown as FeatureCollection<Geometry, { name: string }>;

const projection = geoAlbersUsa().scale(1100).translate([450, 280]);
const pathGen = geoPath(projection);

interface Shape {
  name: string; // the topology's full state name
  d: string;
}

// Geometry is static — built once at module load, never per render.
const SHAPES: Shape[] = usStates.features
  .map((f) => ({ name: f.properties.name, d: pathGen(f) ?? "" }))
  .filter((s) => !!s.d);

const CENTROIDS = new Map<string, [number, number]>(
  usStates.features
    .map((f): [string, [number, number]] => [
      f.properties.name,
      pathGen.centroid(f) as [number, number],
    ])
    .filter(([, c]) => Number.isFinite(c[0]) && Number.isFinite(c[1])),
);

const centroidOfCode = (code: string): [number, number] | null => {
  const name = getStateName(code);
  return (name && CENTROIDS.get(name)) || null;
};

const num = (n: number | null | undefined, digits = 0): string =>
  n == null ? "—" : n.toFixed(digits);

interface LaneLine {
  key: string;
  a: [number, number];
  b: [number, number];
  loads: number;
}

// ------------------------------------------------------------ the shape layer

// ~50 <path>s, the lane lines and the pin — everything that is expensive to
// draw and cheap to leave alone. It is a module-level memo (never a component
// declared inside a render body) so moving the pointer WITHIN a state repaints
// only the tooltip: the layer's props don't change until the hovered state
// does, and then it repaints once to move the amber outline.
interface ShapeLayerProps {
  rowByStateName: Map<string, LedgerRow>;
  metric: MapMetric;
  scale: MapScale;
  selected: string | null;
  hovered: string | null;
  laneLines: LaneLine[];
  pin: MapPin | null;
  pinAt: [number, number] | null;
  onPick: (row: LedgerRow) => void;
  onMove: (row: LedgerRow, e: ReactMouseEvent<SVGPathElement>) => void;
  onEnter: (row: LedgerRow | undefined) => void;
  onLeave: () => void;
}

const ShapeLayerInner = ({
  rowByStateName,
  metric,
  scale,
  selected,
  hovered,
  laneLines,
  pin,
  pinAt,
  onPick,
  onMove,
  onEnter,
  onLeave,
}: ShapeLayerProps) => (
  <>
    {SHAPES.map((s) => {
      const row = rowByStateName.get(s.name);
      const thin = metricThin(row, metric);
      const isSel = !!row && selected === row.state;
      const isHot = !!row && hovered === row.state;
      return (
        <path
          key={s.name}
          d={s.d}
          fill={thin ? `url(#${HATCH_ID})` : colorForRow(row, metric, scale)}
          stroke={isSel ? "#f4f7fb" : isHot ? "#f5b03a" : "rgba(255,255,255,0.12)"}
          strokeWidth={isSel ? 2 : isHot ? 1.6 : 0.5}
          style={{ cursor: row ? "pointer" : "default" }}
          onClick={() => row && onPick(row)}
          onMouseMove={(e) => row && onMove(row, e)}
          onMouseEnter={() => onEnter(row)}
          onMouseLeave={onLeave}
        />
      );
    })}

    {laneLines.map((l) => (
      <line
        key={l.key}
        x1={l.a[0]}
        y1={l.a[1]}
        x2={l.b[0]}
        y2={l.b[1]}
        stroke="#e8940a"
        strokeOpacity={0.55}
        strokeWidth={1 + l.loads}
        strokeLinecap="round"
        style={{ pointerEvents: "none" }}
      />
    ))}

    {pinAt && pin && (
      <g style={{ pointerEvents: "none" }}>
        <circle
          cx={pinAt[0]}
          cy={pinAt[1]}
          r={7}
          fill="var(--color-status-info-text)"
          stroke="var(--color-canvas)"
          strokeWidth={2}
        />
        <text
          x={pinAt[0] + 12}
          y={pinAt[1] + 4}
          style={{
            font: "600 11px sans-serif",
            fill: "#cdd8e8",
            paintOrder: "stroke",
            stroke: "#0b0f16",
            strokeWidth: 3,
          }}
        >
          empty next · {pin.city}, {pin.state}
        </text>
      </g>
    )}
  </>
);

const ShapeLayer = memo(ShapeLayerInner);

// --------------------------------------------------------------- the tooltip

const TIP_W = 320; // the tip's maxWidth
const TIP_GAP = 14; // how far off the pointer it sits
const TIP_SPAN = TIP_W + TIP_GAP; // 334 — the room a right-hand tip needs
const TIP_H = 64; // two condensed lines plus padding

interface HoverState {
  x: number;
  y: number;
  // The board's own size, measured in the pointer handler (never read off the
  // ref during render) so the tip can be clamped inside it.
  w: number;
  h: number;
  row: LedgerRow;
}

export const LanesMap = ({
  rows,
  metric,
  selected,
  onSelect,
  showLanes,
  lanes,
  pin,
  hoverRow,
  hovered,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  // A row is keyed by state code at state grain and by freight region at
  // region grain; either way it paints every state that belongs to it, so the
  // map needs no separate grain flag.
  const rowByStateName = useMemo(() => {
    const map = new Map<string, LedgerRow>();
    for (const row of rows) {
      const name = getStateName(row.state);
      if (name) map.set(name, row);
      else for (const member of statesInRegion(row.state)) map.set(member, row);
    }
    return map;
  }, [rows]);

  const scale = useMemo(() => mapScale(rows), [rows]);

  // Straight lines between the two states' centroids — no geocoding, no arcs.
  const laneLines = useMemo<LaneLine[]>(() => {
    if (!showLanes) return [];
    return lanes
      .map((l) => {
        const a = centroidOfCode(l.originState);
        const b = centroidOfCode(l.destState);
        return a && b ? { key: l.lane, a, b, loads: l.loads } : null;
      })
      .filter((l): l is LaneLine => !!l);
  }, [showLanes, lanes]);

  const pinAt = useMemo(() => {
    if (!pin) return null;
    const p = projection([pin.lng, pin.lat]);
    return p && Number.isFinite(p[0]) ? (p as [number, number]) : null;
  }, [pin]);

  const handlePick = useCallback(
    (row: LedgerRow) => onSelect(selected === row.state ? null : row.state),
    [onSelect, selected],
  );

  const handleMove = useCallback(
    (row: LedgerRow, e: ReactMouseEvent<SVGPathElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setHover({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        w: rect.width,
        h: rect.height,
        row,
      });
    },
    [],
  );

  const handleEnter = useCallback(
    (row: LedgerRow | undefined) => hoverRow?.(row ?? null),
    [hoverRow],
  );

  const handleLeave = useCallback(() => {
    setHover(null);
    hoverRow?.(null);
  }, [hoverRow]);

  const legend = METRIC_LEGEND[metric];
  const ramp = metric === "volume" ? VOL_RAMP : metric === "in" ? IN_RAMP : RATE_RAMP;

  // Kept inside the board: a tip that would run off the right edge flips to the
  // pointer's left, and it never drops below the bottom.
  const tip = hover
    ? {
        left: Math.max(
          0,
          hover.x + TIP_SPAN > hover.w ? hover.x - TIP_SPAN : hover.x + TIP_GAP,
        ),
        top: Math.max(0, Math.min(hover.y + TIP_GAP, hover.h - TIP_H)),
      }
    : null;

  return (
    <div ref={containerRef} className="relative">
      <svg viewBox="0 0 900 560" className="w-full block">
        <defs>
          <pattern
            id={HATCH_ID}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(135)"
          >
            <rect width="6" height="6" fill="var(--color-well)" />
            <rect width="2" height="6" fill="var(--color-plate-lo)" />
          </pattern>
        </defs>

        <ShapeLayer
          rowByStateName={rowByStateName}
          metric={metric}
          scale={scale}
          selected={selected}
          hovered={hovered ?? null}
          laneLines={laneLines}
          pin={pin}
          pinAt={pinAt}
          onPick={handlePick}
          onMove={handleMove}
          onEnter={handleEnter}
          onLeave={handleLeave}
        />
      </svg>

      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap pt-2.5 text-[10.5px] text-faint font-condensed">
        <span className="flex items-center gap-[5px]">
          {legend.label}
          {ramp.map((c) => (
            <span key={c} className="w-4 h-2 rounded-[2px]" style={{ background: c }} />
          ))}
          {legend.more}
        </span>
        <span className="flex items-center gap-[5px]">
          <span
            className="w-4 h-2 rounded-[2px] border border-hairline"
            style={{
              background:
                "repeating-linear-gradient(135deg, var(--color-well) 0 3px, var(--color-plate-lo) 3px 5px)",
            }}
          />
          thin (1 load)
        </span>
        <span className="flex items-center gap-[5px]">
          <span
            className="w-[10px] h-[10px] rounded-full"
            style={{ background: "var(--color-status-info-text)" }}
          />
          empty next
        </span>
      </div>

      {hover && tip && (
        <div
          className="absolute pointer-events-none bg-panel border border-hairline rounded-lg px-2.5 py-2 text-[12px] text-dim font-condensed z-10 shadow-lg"
          style={{ left: tip.left, top: tip.top, maxWidth: TIP_W }}
        >
          <div>
            <b className="text-ink font-semibold">{hover.row.name}</b> · OUT{" "}
            {hover.row.out.loads} load{hover.row.out.loads === 1 ? "" : "s"} · typical{" "}
            <b className="text-ink font-semibold">{fmtRpm(hover.row.out.typicalRpm)}</b>/mi ·{" "}
            {money(hover.row.out.perDay.perDay)}/day · {hover.row.out.agents} agent
            {hover.row.out.agents === 1 ? "" : "s"}
          </div>
          <div>
            IN {hover.row.in.deliveries} deliver
            {hover.row.in.deliveries === 1 ? "y" : "ies"} · reload{" "}
            <b className="text-ink font-semibold">
              {num(hover.row.in.reloadMilesMedian)}
            </b>{" "}
            mi · {num(hover.row.in.idleDaysAvg, 1)} days idle · next load{" "}
            {fmtRpm(hover.row.in.nextRpmMedian)}/mi
          </div>
        </div>
      )}
    </div>
  );
};
