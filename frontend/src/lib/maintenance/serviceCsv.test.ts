import { describe, it, expect } from "vitest";
import type { MaintenanceService } from "@/types/maintenance";
import { servicesCsv, readingOf, CSV_HEADER } from "./serviceCsv";

const service = (over: Partial<MaintenanceService>): MaintenanceService => ({
  service_id: "s",
  unit: "both",
  service_date: "2026-08-21",
  odometer: 594801,
  trailer_hub: 594801,
  apu_hours: null,
  vendor: "TA Petro",
  location: "Preston, AR",
  description: "Full PM",
  cost: 840.87,
  invoice_number: null,
  notes: null,
  item_ids: ["oil", "fuel"],
  kind: "pm",
  warranty_until: null,
  ...over,
});

describe("servicesCsv", () => {
  const names = new Map([["oil", "Engine oil + filter"], ["fuel", "Fuel filter + water separator"]]);

  it("writes the header and one line per row, in the report's columns", () => {
    const csv = servicesCsv([service({})], names);
    const [head, row] = csv.split("\r\n");
    expect(head).toBe(CSV_HEADER.join(","));
    expect(row).toBe("2026-08-21,Truck + trailer,594801,Full PM,Engine oil + filter; Fuel filter + water separator,PM,TA Petro,\"Preston, AR\",840.87,,");
  });

  it("quotes commas, quotes and newlines; blanks stay blank, never 0", () => {
    const csv = servicesCsv(
      [service({ description: 'Replaced the "left" air line, steer axle', cost: null, vendor: null, location: null, item_ids: [], kind: null })],
      names,
    );
    const row = csv.split("\r\n")[1];
    expect(row).toBe('2026-08-21,Truck + trailer,594801,"Replaced the ""left"" air line, steer axle",,,,,,,');
  });

  it("reads each unit's own meter", () => {
    expect(readingOf(service({ unit: "apu", apu_hours: 13413 }))).toBe("13413 hrs");
    expect(readingOf(service({ unit: "trailer", trailer_hub: 600000 }))).toBe("600000");
    expect(readingOf(service({ unit: "tractor", odometer: null }))).toBe("");
  });
});
