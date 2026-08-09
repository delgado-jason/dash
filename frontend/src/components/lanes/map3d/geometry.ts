import * as THREE from "three";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry, Position } from "geojson";
import statesTopo from "us-atlas/states-10m.json";
import type { Load } from "@/types/load";
import { getStateName } from "@/lib/constants/states";
import { loadRevenue } from "@/lib/metrics/loads";

// The 3D board shares the SVG map's exact projection so both renderers agree
// on where America is. SVG space (900×560) maps to scene units with the
// country centered on the origin; +Y is up (extrusion height).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = statesTopo as any;
const usStates = feature(
  topo,
  topo.objects.states,
) as unknown as FeatureCollection<Geometry, { name: string }>;

const projection = geoAlbersUsa().scale(1100).translate([450, 280]);
const pathGen = geoPath(projection);

const SCALE = 28; // svg px per scene unit
const toScene = ([x, y]: [number, number]): [number, number] => [
  (x - 450) / SCALE,
  (y - 280) / SCALE,
];

export interface StateSolid {
  name: string;
  shapes: THREE.Shape[];
  centroid: [number, number]; // scene [x, z]
}

// GeoJSON ring → THREE.Shape path points. Shapes are built in the XY plane
// with y = -z so a single rotateX(-90°) on the mesh lays them onto the ground
// with extrusion depth pointing up (+Y).
const ringToPts = (ring: Position[]): THREE.Vector2[] =>
  ring.map((pos) => {
    const proj = projection(pos as [number, number]);
    if (!proj) return null;
    const [sx, sz] = toScene(proj);
    return new THREE.Vector2(sx, -sz);
  }).filter((v): v is THREE.Vector2 => v !== null);

const polyToShape = (poly: Position[][]): THREE.Shape | null => {
  const outer = ringToPts(poly[0]);
  if (outer.length < 3) return null;
  const shape = new THREE.Shape(outer);
  for (let i = 1; i < poly.length; i++) {
    const hole = ringToPts(poly[i]);
    if (hole.length >= 3) shape.holes.push(new THREE.Path(hole));
  }
  return shape;
};

let cache: StateSolid[] | null = null;

// Alaska/Hawaii survive albersUsa (it insets them), so every state that
// projects becomes a solid. Built once per session — geometry is static.
export const stateSolids = (): StateSolid[] => {
  if (cache) return cache;
  cache = usStates.features
    .map((f) => {
      const name = f.properties.name;
      const g = f.geometry;
      let shapes: THREE.Shape[] = [];
      if (g.type === "Polygon") {
        const s = polyToShape(g.coordinates as Position[][]);
        if (s) shapes = [s];
      } else if (g.type === "MultiPolygon") {
        shapes = (g.coordinates as Position[][][])
          .map(polyToShape)
          .filter((s): s is THREE.Shape => s !== null);
      }
      const c = pathGen.centroid(f);
      if (!shapes.length || !Number.isFinite(c[0])) return null;
      const [cx, cz] = toScene(c as [number, number]);
      return { name, shapes, centroid: [cx, cz] as [number, number] };
    })
    .filter((s): s is StateSolid => s !== null);
  return cache;
};

export interface LaneFlow {
  from: string; // full state name
  to: string;
  loads: number;
  gross: number;
}

// State→state freight flows for the arcs — straight off origin_state /
// destination_state, no geocoding. Same-state hops are dropped (a zero-length
// arc says nothing). Presentation-side derivation; the frozen lib is untouched.
export const buildFlows = (loads: Load[]): LaneFlow[] => {
  const map = new Map<string, LaneFlow>();
  for (const l of loads) {
    const from = getStateName(l.origin_state);
    const to = getStateName(l.destination_state);
    if (!from || !to || from === to) continue;
    const key = `${from}→${to}`;
    const f = map.get(key);
    if (f) {
      f.loads += 1;
      f.gross += loadRevenue(l);
    } else {
      map.set(key, { from, to, loads: 1, gross: loadRevenue(l) });
    }
  }
  return [...map.values()].sort((a, b) => b.gross - a.gross);
};
