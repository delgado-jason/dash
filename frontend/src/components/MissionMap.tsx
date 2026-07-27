import { useEffect, useMemo, useState } from "react";
import { makeProjector, geoPath, type LngLat } from "@/lib/geoProject";
import type { GeoPoint } from "@/services/routingService";

interface MissionMapProps {
  pickup: GeoPoint;
  delivery: GeoPoint;
  deadhead?: GeoPoint | null; // omit/null → no deadhead leg (e.g. a booked load)
  loadedMiles?: number | null;
  deadheadMiles?: number | null;
  height?: number;
}

type Feat = { geometry: { type: string; coordinates: unknown } };

// Load the US states once for the whole app, lazily — a ~115KB dataset that has
// no business in the main bundle. Failures degrade to no borders (route only).
let statesPromise: Promise<Feat[]> | null = null;
const loadStates = (): Promise<Feat[]> => {
  if (!statesPromise) {
    statesPromise = Promise.all([
      import("us-atlas/states-10m.json"),
      import("topojson-client"),
    ])
      .then(([topoMod, tj]) => {
        const topo = ((topoMod as { default?: unknown }).default ??
          topoMod) as { objects: { states: unknown } };
        const feature = (tj as { feature: (t: unknown, o: unknown) => { features: Feat[] } }).feature;
        return feature(topo, topo.objects.states).features;
      })
      .catch(() => []);
  }
  return statesPromise;
};

const label = (city: string, state: string) => `${city}, ${state}`;

const MissionMap = ({
  pickup,
  delivery,
  deadhead,
  loadedMiles,
  deadheadMiles,
  height = 300,
}: MissionMapProps) => {
  const [states, setStates] = useState<Feat[]>([]);
  useEffect(() => {
    let active = true;
    loadStates().then((f) => active && setStates(f));
    return () => {
      active = false;
    };
  }, []);

  const W = 860;
  const H = height;

  const project = useMemo(() => {
    const pts: LngLat[] = [
      { lng: pickup.lng, lat: pickup.lat },
      { lng: delivery.lng, lat: delivery.lat },
    ];
    if (deadhead) pts.push({ lng: deadhead.lng, lat: deadhead.lat });
    // Extra padding leaves room for the reticle crosshair + labels at the edges.
    return makeProjector(pts, W, H, 46);
  }, [pickup, delivery, deadhead, H]);

  const statePaths = useMemo(
    () => states.map((f) => geoPath(f.geometry, project)).filter(Boolean),
    [states, project],
  );

  const pk = project(pickup);
  const dl = project(delivery);
  const dh = deadhead ? project(deadhead) : null;
  const clampY = (y: number) => Math.max(15, Math.min(H - 7, y));
  // Keep labels inside the frame: a pin near an edge anchors its label inward.
  const anchorFor = (x: number): "start" | "middle" | "end" =>
    x < W * 0.16 ? "start" : x > W * 0.84 ? "end" : "middle";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", borderRadius: 9, display: "block" }}
      role="img"
      aria-label={`Route from ${label(pickup.city, pickup.state)} to ${label(delivery.city, delivery.state)}`}
    >
      <rect width={W} height={H} fill="#0e1420" />

      {/* Faint state borders, zoomed to the run. */}
      {statePaths.map((d, i) => (
        <path key={i} d={d} fill="#111d2c" stroke="#28384f" strokeWidth={1} strokeLinejoin="round" />
      ))}

      {/* Deadhead leg (empty) under the loaded haul. */}
      {dh && (
        <line x1={dh.x} y1={dh.y} x2={pk.x} y2={pk.y} stroke="#7c8899" strokeWidth={3} strokeDasharray="7 6" strokeLinecap="round" />
      )}
      {/* Loaded haul. */}
      <line x1={pk.x} y1={pk.y} x2={dl.x} y2={dl.y} stroke="#f5b03a" strokeWidth={4} strokeLinecap="round" />

      {/* Pins. */}
      {dh && <circle cx={dh.x} cy={dh.y} r={6} fill="#8b98a9" />}
      <circle cx={pk.x} cy={pk.y} r={8} fill="#4ade80" stroke="#0e1420" strokeWidth={2} />

      {/* Objective — target reticle. */}
      <circle cx={dl.x} cy={dl.y} r={13} fill="none" stroke="#f87171" strokeWidth={2.5} />
      <circle cx={dl.x} cy={dl.y} r={4.5} fill="#f87171" />
      <line x1={dl.x} y1={dl.y - 20} x2={dl.x} y2={dl.y - 13} stroke="#f87171" strokeWidth={2.5} />
      <line x1={dl.x} y1={dl.y + 13} x2={dl.x} y2={dl.y + 20} stroke="#f87171" strokeWidth={2.5} />
      <line x1={dl.x - 20} y1={dl.y} x2={dl.x - 13} y2={dl.y} stroke="#f87171" strokeWidth={2.5} />
      <line x1={dl.x + 13} y1={dl.y} x2={dl.x + 20} y2={dl.y} stroke="#f87171" strokeWidth={2.5} />

      {/* Labels. */}
      <g fontFamily="system-ui" fontSize={13} fontWeight={600}>
        <text x={pk.x} y={clampY(pk.y + 24)} fill="#eaf1f8" textAnchor={anchorFor(pk.x)}>
          {label(pickup.city, pickup.state)}
        </text>
        <text x={dl.x} y={clampY(dl.y - 24)} fill="#eaf1f8" textAnchor={anchorFor(dl.x)}>
          {label(delivery.city, delivery.state)}
        </text>
        {dh && (
          <text x={dh.x} y={clampY(dh.y + 22)} fill="#8b98a9" textAnchor={anchorFor(dh.x)} fontWeight={400}>
            {label(deadhead!.city, deadhead!.state)}
          </text>
        )}
      </g>
      <g fontFamily="system-ui" fontSize={11.5} fontWeight={600}>
        {loadedMiles != null && (
          <text x={(pk.x + dl.x) / 2} y={clampY((pk.y + dl.y) / 2 - 8)} fill="#f5b03a" textAnchor="middle">
            {Math.round(loadedMiles).toLocaleString("en-US")} mi loaded
          </text>
        )}
        {dh && deadheadMiles != null && (
          <text x={(dh.x + pk.x) / 2} y={clampY((dh.y + pk.y) / 2 - 8)} fill="#8b98a9" textAnchor="middle" fontWeight={400}>
            {Math.round(deadheadMiles).toLocaleString("en-US")} mi deadhead
          </text>
        )}
      </g>
    </svg>
  );
};

export default MissionMap;
