import { describe, it, expect } from "vitest";
import type { ComplianceItem } from "@/types/compliance";
import { paperworkItems, paperworkRows, quarterOf, daysUntil } from "./paperwork";

const item = (over: Partial<ComplianceItem>): ComplianceItem =>
  ({
    compliance_item_id: "c",
    scope: "truck",
    driver_id: null,
    truck_id: null,
    trailer_id: null,
    label: "Landstar 120",
    category: "inspection",
    issued_on: null,
    expires_on: "2026-12-08",
    renewal_months: 3,
    warn_lead_days: 14,
    doc_number: null,
    notes: null,
    active: true,
    created_at: "",
    updated_at: "",
    ...over,
  }) as ComplianceItem;

describe("paperwork", () => {
  // Jason's Compliance page on Nov 15: the Landstar 120 on the truck and the
  // trailer (Dec 8), the Maintenance Report on both (Dec 17, one filed under
  // "other"), and three that are not maintenance paperwork.
  const items = [
    item({ compliance_item_id: "a", scope: "truck" }),
    item({ compliance_item_id: "b", scope: "trailer" }),
    item({ compliance_item_id: "c", scope: "trailer", label: "Maintenance Report", category: "other", expires_on: "2026-12-17" }),
    item({ compliance_item_id: "d", scope: "truck", label: "Maintenance Report", category: "maintenance report", expires_on: "2026-12-17" }),
    item({ compliance_item_id: "e", label: "HVUT Form 2290", category: "tax", expires_on: "2027-08-31" }),
    item({ compliance_item_id: "f", scope: "driver", label: "Medical card (DOT physical)", category: "medical", expires_on: "2028-01-23" }),
    item({ compliance_item_id: "g", label: "Landstar 120", active: false, expires_on: "2026-09-08" }),
  ];

  it("keeps the inspection and the report, by category or by name, active with a date", () => {
    expect(paperworkItems(items).map((i) => i.compliance_item_id)).toEqual(["a", "b", "c", "d"]);
  });

  it("prints one row per label with the scopes joined and the earliest date, soonest first", () => {
    expect(paperworkRows(items)).toEqual([
      { label: "Landstar 120", scopes: "truck + trailer", expires: "2026-12-08" },
      { label: "Maintenance Report", scopes: "trailer + truck", expires: "2026-12-17" },
    ]);
  });

  it("knows the calendar quarter and the days to a date", () => {
    expect(quarterOf("2026-11-15")).toEqual({ from: "2026-10", to: "2026-12", start: "2026-10-01" });
    expect(quarterOf("2026-01-02")).toEqual({ from: "2026-01", to: "2026-03", start: "2026-01-01" });
    expect(daysUntil("2026-12-08", "2026-11-15")).toBe(23);
    expect(daysUntil("2026-11-01", "2026-11-15")).toBe(-14);
  });
});
