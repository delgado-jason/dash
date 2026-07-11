import { describe, it, expect } from "vitest";
import {
  daysUntil,
  computeComplianceDue,
  complianceSummary,
  complianceAlerts,
  type Checkable,
} from "./compliance";

const NOW = new Date("2026-07-10T12:00:00Z");

const chk = (over: Partial<Checkable>): Checkable => ({
  id: "x",
  label: "Doc",
  scope: "driver",
  expires_on: null,
  warn_lead_days: 30,
  ...over,
});

describe("daysUntil", () => {
  it("counts whole days in UTC, no day-shift", () => {
    expect(daysUntil("2026-07-31", NOW)).toBe(21);
    expect(daysUntil("2026-07-10", NOW)).toBe(0);
    expect(daysUntil("2026-07-01", NOW)).toBe(-9);
  });
});

describe("computeComplianceDue", () => {
  it("valid when beyond the lead window", () => {
    expect(computeComplianceDue({ expires_on: "2026-12-01", warn_lead_days: 30 }, NOW).level).toBe("valid");
  });
  it("expiring inside the lead window (inclusive)", () => {
    expect(computeComplianceDue({ expires_on: "2026-07-31", warn_lead_days: 30 }, NOW).level).toBe("expiring");
    expect(computeComplianceDue({ expires_on: "2026-08-09", warn_lead_days: 30 }, NOW).level).toBe("expiring");
  });
  it("expired the day after it lapses", () => {
    expect(computeComplianceDue({ expires_on: "2026-07-09", warn_lead_days: 30 }, NOW).level).toBe("expired");
  });
  it("unknown with no expiry", () => {
    expect(computeComplianceDue({ expires_on: null, warn_lead_days: 30 }, NOW).level).toBe("unknown");
  });
});

describe("complianceSummary", () => {
  it("counts by level", () => {
    const s = complianceSummary(
      [
        chk({ expires_on: "2026-12-01" }), // valid
        chk({ expires_on: "2026-07-31" }), // expiring
        chk({ expires_on: null }), // unknown
      ],
      NOW,
    );
    expect(s).toMatchObject({ valid: 1, expiring: 1, expired: 0, unknown: 1, status: "cleared" });
  });
  it("grounds on an expired driver/vehicle doc", () => {
    const s = complianceSummary([chk({ scope: "truck", expires_on: "2026-06-01" })], NOW);
    expect(s.status).toBe("grounded");
    expect(s.expired).toBe(1);
  });
  it("an expired business doc counts but does not ground", () => {
    const s = complianceSummary([chk({ scope: "business", expires_on: "2026-06-01" })], NOW);
    expect(s.status).toBe("cleared");
    expect(s.expired).toBe(1);
  });
});

describe("complianceAlerts", () => {
  it("emits expired (critical) before expiring (warning)", () => {
    const alerts = complianceAlerts(
      [
        chk({ id: "a", label: "Med card", expires_on: "2026-07-31" }), // expiring
        chk({ id: "b", label: "Inspection", scope: "truck", expires_on: "2026-07-01" }), // expired
        chk({ id: "c", label: "2290", scope: "truck", expires_on: "2027-01-01" }), // valid → no alert
      ],
      NOW,
    );
    expect(alerts.map((a) => a.id)).toEqual(["compliance-b", "compliance-a"]);
    expect(alerts[0]).toMatchObject({ kind: "compliance", severity: "critical" });
    expect(alerts[1]).toMatchObject({ severity: "warning", actionHref: "/compliance" });
  });
  it("is empty when everything is valid", () => {
    expect(complianceAlerts([chk({ expires_on: "2030-01-01" })], NOW)).toEqual([]);
  });
});
