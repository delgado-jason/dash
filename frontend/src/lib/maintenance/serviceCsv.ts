// The log as a CSV — the range you picked, in the columns Landstar's
// Maintenance Report asks for, so the quarter is a download instead of a
// re-type (the Maintenance sheet, call 8). Pure.
import type { MaintenanceService } from "@/types/maintenance";
import { kindLabel } from "./serviceKind";

const UNIT_WORD: Record<string, string> = {
  tractor: "Truck",
  trailer: "Trailer",
  both: "Truck + trailer",
  apu: "APU",
};

// The reading the row carries, on the unit's own meter.
export const readingOf = (s: MaintenanceService): string => {
  if (s.unit === "apu") return s.apu_hours == null ? "" : `${s.apu_hours} hrs`;
  if (s.unit === "trailer") return s.trailer_hub == null ? "" : String(s.trailer_hub);
  return s.odometer == null ? "" : String(s.odometer);
};

const cell = (v: string | number | null | undefined): string => {
  const t = v == null ? "" : String(v);
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export const CSV_HEADER = [
  "Date",
  "Unit",
  "Reading",
  "Work done",
  "Clocks reset",
  "Kind",
  "Vendor",
  "City",
  "Cost",
  "Invoice",
  "Warranty until",
];

export const servicesCsv = (rows: MaintenanceService[], nameById: Map<string, string>): string => {
  const lines = [CSV_HEADER.map(cell).join(",")];
  for (const s of rows) {
    lines.push(
      [
        s.service_date,
        UNIT_WORD[s.unit] ?? s.unit,
        readingOf(s),
        s.description,
        s.item_ids.map((id) => nameById.get(id) ?? "").filter(Boolean).join("; "),
        s.kind ? kindLabel(s.kind) : "",
        s.vendor ?? "",
        s.location ?? "",
        s.cost == null ? "" : s.cost.toFixed(2),
        s.invoice_number ?? "",
        s.warranty_until ?? "",
      ]
        .map(cell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
};
