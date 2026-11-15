import { describe, it, expect } from "vitest";
import type { MaintenanceIssue } from "@/types/maintenance";
import { sortIssues, openIssues, daysOpen } from "./issues";

const issue = (over: Partial<MaintenanceIssue>): MaintenanceIssue => ({
  issue_id: "i",
  unit: "tractor",
  what: "warning light",
  noticed_on: "2026-10-19",
  severity: "watch",
  status: "open",
  closed_by_service_id: null,
  closed_on: null,
  notes: null,
  ...over,
});

describe("issues", () => {
  it("sorts open before closed, now before soon before watch, oldest first within a severity", () => {
    const sorted = sortIssues([
      issue({ issue_id: "a", severity: "watch", noticed_on: "2026-10-01" }),
      issue({ issue_id: "b", severity: "now", noticed_on: "2026-11-10" }),
      issue({ issue_id: "c", severity: "soon", noticed_on: "2026-11-01" }),
      issue({ issue_id: "d", severity: "now", noticed_on: "2026-11-01" }),
      issue({ issue_id: "e", severity: "now", status: "closed", noticed_on: "2026-09-01" }),
    ]);
    expect(sorted.map((i) => i.issue_id)).toEqual(["d", "b", "c", "a", "e"]);
    expect(openIssues(sorted).map((i) => i.issue_id)).toEqual(["d", "b", "c", "a"]);
  });

  it("counts the days open on day keys, never negative", () => {
    expect(daysOpen(issue({ noticed_on: "2026-10-19" }), "2026-11-15")).toBe(27);
    expect(daysOpen(issue({ noticed_on: "2026-11-20" }), "2026-11-15")).toBe(0);
  });
});
