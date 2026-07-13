import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { FuelEntry } from "@/types/fuelEntry";
import { computePatches } from "./patches";

const L = (o: Record<string, unknown>): Load =>
  ({
    load_status: "delivered",
    fuel_surcharge: "0",
    total_accessorials: "0",
    loaded_miles: 500,
    deadhead_miles: 0,
    ...o,
  }) as unknown as Load;

const find = (loads: Load[], key: string) =>
  computePatches(loads, [] as FuelEntry[]).find((p) => p.key === key)!;

describe("computePatches", () => {
  it("Trailblazer counts distinct states touched", () => {
    const loads = [
      L({ delivery_date: "2026-05-01", origin_state: "TX", destination_state: "GA", linehaul: "2000" }),
      L({ delivery_date: "2026-05-08", origin_state: "GA", destination_state: "FL", linehaul: "2000" }),
      L({ delivery_date: "2026-05-15", origin_state: "TX", destination_state: "FL", linehaul: "2000" }),
    ];
    expect(find(loads, "trailblazer").count).toBe(3); // TX, GA, FL
    expect(find(loads, "trailblazer").hint).toBe("3 / 48 states");
  });

  it("Doubleheader counts days with 2+ deliveries", () => {
    const loads = [
      L({ delivery_date: "2026-05-01", linehaul: "1000" }),
      L({ delivery_date: "2026-05-01", linehaul: "1000" }),
      L({ delivery_date: "2026-05-02", linehaul: "1000" }),
    ];
    expect(find(loads, "doubleheader").count).toBe(1); // only 05-01
  });

  it("Big Ticket earns against the floor and exposes the current bar", () => {
    const loads = [
      L({ delivery_date: "2026-05-01", linehaul: "9000" }), // clears $7k floor
      L({ delivery_date: "2026-05-02", linehaul: "3000" }),
      L({ delivery_date: "2026-05-03", linehaul: "8000" }), // clears
    ];
    const bt = find(loads, "big-ticket");
    expect(bt.count).toBe(2);
    expect(bt.bar).toBe(7000);
    expect(bt.unit).toBe("money");
  });

  it("Coast to Coast spots a West↔East run", () => {
    const loads = [
      L({ delivery_date: "2026-05-01", origin_state: "CA", destination_state: "FL", linehaul: "5000" }),
      L({ delivery_date: "2026-05-08", origin_state: "TX", destination_state: "OK", linehaul: "1000" }),
    ];
    expect(find(loads, "coast-to-coast").count).toBe(1);
  });
});
