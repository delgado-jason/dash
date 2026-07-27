import { describe, it, expect } from "vitest";
import { makeProjector, geoPath } from "./geoProject";

describe("makeProjector", () => {
  it("puts a single point at the center of the box", () => {
    const p = makeProjector([{ lng: -96, lat: 39 }], 800, 300);
    const { x, y } = p({ lng: -96, lat: 39 });
    expect(x).toBeCloseTo(400, 0);
    expect(y).toBeCloseTo(150, 0);
  });

  it("preserves compass orientation: east → larger x, north → smaller y", () => {
    const pts = [
      { lng: -96, lat: 32 }, // SW (Dallas-ish)
      { lng: -84, lat: 34 }, // NE (Atlanta-ish)
    ];
    const proj = makeProjector(pts, 800, 300);
    const sw = proj(pts[0]);
    const ne = proj(pts[1]);
    expect(ne.x).toBeGreaterThan(sw.x); // east is right
    expect(ne.y).toBeLessThan(sw.y); // north is up
  });

  it("keeps every point inside the padded box", () => {
    const pts = [
      { lng: -122, lat: 47 },
      { lng: -71, lat: 42 },
      { lng: -96, lat: 30 },
    ];
    const pad = 26;
    const proj = makeProjector(pts, 800, 320, pad);
    for (const pt of pts) {
      const { x, y } = proj(pt);
      expect(x).toBeGreaterThanOrEqual(pad - 1);
      expect(x).toBeLessThanOrEqual(800 - pad + 1);
      expect(y).toBeGreaterThanOrEqual(pad - 1);
      expect(y).toBeLessThanOrEqual(320 - pad + 1);
    }
  });
});

describe("geoPath", () => {
  it("builds a closed SVG path from a Polygon", () => {
    const proj = makeProjector([{ lng: 0, lat: 0 }], 100, 100);
    const d = geoPath(
      { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      proj,
    );
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect((d.match(/Z/g) || []).length).toBe(1);
  });

  it("handles MultiPolygon (one Z per ring) and ignores other types", () => {
    const proj = makeProjector([{ lng: 0, lat: 0 }], 100, 100);
    const d = geoPath(
      {
        type: "MultiPolygon",
        coordinates: [
          [[[0, 0], [1, 0], [0, 0]]],
          [[[2, 2], [3, 2], [2, 2]]],
        ],
      },
      proj,
    );
    expect((d.match(/Z/g) || []).length).toBe(2);
    expect(geoPath({ type: "Point", coordinates: [0, 0] }, proj)).toBe("");
  });
});
