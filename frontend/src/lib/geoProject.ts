// Tiny equirectangular projector for the mission map: fit a set of lng/lat points
// into a WxH box, so the geocoded route AND the state-border outlines share one
// coordinate space. Longitude is scaled by cos(midLat) so the map doesn't look
// east-west stretched at US latitudes. Latitude flips (screen y grows down).
// A minimum span keeps a short haul from zooming in absurdly.

export interface LngLat {
  lng: number;
  lat: number;
}
export interface XY {
  x: number;
  y: number;
}

export interface Projector {
  (p: LngLat): XY;
}

export const makeProjector = (
  points: LngLat[],
  width: number,
  height: number,
  pad = 26,
  minSpanDeg = 2.2,
): Projector => {
  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const p of points) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  // Empty/degenerate guard — center on the point(s) with the min span.
  if (!Number.isFinite(minLng)) {
    minLng = -98;
    maxLng = -98;
    minLat = 39;
    maxLat = 39;
  }

  const midLat = (minLat + maxLat) / 2;
  const k = Math.cos((midLat * Math.PI) / 180) || 1; // lng compression at this latitude

  // Enforce a minimum span (in degrees), expanding around the center.
  const cLng = (minLng + maxLng) / 2;
  const cLat = (minLat + maxLat) / 2;
  const halfLng = Math.max((maxLng - minLng) / 2, minSpanDeg / 2 / (k || 1));
  const halfLat = Math.max((maxLat - minLat) / 2, minSpanDeg / 2);

  // Uniform scale that fits both axes into the padded box (letterboxed).
  const spanX = halfLng * 2 * k; // adjusted-longitude span
  const spanY = halfLat * 2;
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);

  return (p: LngLat): XY => ({
    x: width / 2 + (p.lng - cLng) * k * scale,
    y: height / 2 - (p.lat - cLat) * scale, // flip: north is up
  });
};

// A GeoJSON Polygon/MultiPolygon → an SVG path `d`, projected. Rings are
// [ [lng,lat], ... ]. Unknown geometry types yield an empty string.
type Ring = [number, number][];
export const geoPath = (
  geometry: { type: string; coordinates: unknown },
  project: Projector,
): string => {
  const ringPath = (ring: Ring): string =>
    ring
      .map(([lng, lat], i) => {
        const { x, y } = project({ lng, lat });
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join("") + "Z";

  if (geometry.type === "Polygon") {
    return (geometry.coordinates as Ring[]).map(ringPath).join("");
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as Ring[][])
      .flatMap((poly) => poly.map(ringPath))
      .join("");
  }
  return "";
};
