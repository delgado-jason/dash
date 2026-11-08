import { describe, it, expect } from "vitest";
import { computeTrailerMetrics } from "./trailerMetrics";
import type { Trailer } from "@/types/trailer";
import type { Load } from "@/types/load";

const ld = (o: Record<string, unknown>): Load =>
  ({
    load_status: "delivered",
    payment_status: "paid",
    pickup_date: "2026-01-05",
    delivery_date: "2026-01-07",
    loaded_miles: 500,
    deadhead_miles: 0,
    trailer_net: "80",
    ...o,
  }) as unknown as Load;

describe("computeTrailerMetrics — a TONU is never a booked load (GL-104)", () => {
  const trailer = { in_service_date: "2026-01-01" } as Trailer;
  const now = new Date("2026-02-01T00:00:00Z");

  it("loads, earnings, miles and active weeks ignore a TONU", () => {
    const real = [ld({})];
    const tonu = ld({ load_status: "tonu", pickup_date: "2026-01-20", delivery_date: "2026-01-20", trailer_net: "20" });
    const a = computeTrailerMetrics(trailer, real, [], now);
    const b = computeTrailerMetrics(trailer, [...real, tonu], [], now);
    expect(b).toEqual(a);
    expect(b.loads).toBe(1);
  });
});
