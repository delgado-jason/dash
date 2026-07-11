// Compliance is maintenance's twin, keyed on dates instead of miles. Each
// tracked document has an expiry; the engine flags it valid / expiring / expired
// and emits alerts into the shared dashboard region.
import type { Alert } from "@/types/alert";
import type { ComplianceScope } from "@/types/compliance";

export type ComplianceLevel = "valid" | "expiring" | "expired" | "unknown";

export interface ComplianceDue {
  level: ComplianceLevel;
  daysRemaining: number | null;
  expiresOn: string | null;
}

// Anything the engine can evaluate: a real compliance_item OR the CDL read off a
// driver record. Kept minimal so both sources can be mapped to it.
export interface Checkable {
  id: string;
  label: string;
  scope: ComplianceScope;
  expires_on: string | null;
  warn_lead_days: number;
  actionHref?: string;
}

// CDL renewals take a while, so warn earlier than the 30-day default.
export const CDL_WARN_LEAD_DAYS = 45;

// Map the two sources — real compliance items and the CDL read off a driver —
// onto a common Checkable so the engine treats them identically.
export const itemToCheckable = (i: {
  compliance_item_id: string;
  label: string;
  scope: ComplianceScope;
  expires_on: string | null;
  warn_lead_days: number;
}): Checkable => ({
  id: i.compliance_item_id,
  label: i.label,
  scope: i.scope,
  expires_on: i.expires_on,
  warn_lead_days: i.warn_lead_days,
  actionHref: "/compliance",
});

export const cdlToCheckable = (d: {
  driver_id: string;
  first_name: string;
  last_name: string;
  cdl_expiration: string | null;
}): Checkable => ({
  id: `cdl-${d.driver_id}`,
  label: `CDL — ${d.first_name} ${d.last_name}`.trim(),
  scope: "driver",
  expires_on: d.cdl_expiration,
  warn_lead_days: CDL_WARN_LEAD_DAYS,
  actionHref: "/compliance",
});

const DAY = 86400000;

// Whole-day difference from `now` to a 'YYYY-MM-DD' date, computed in UTC so a
// date never day-shifts across a timezone. Positive = future, negative = past.
export const daysUntil = (isoDate: string, now: Date): number => {
  const target = new Date(isoDate.slice(0, 10) + "T00:00:00Z").getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / DAY);
};

export const computeComplianceDue = (
  item: { expires_on: string | null; warn_lead_days: number },
  now: Date,
): ComplianceDue => {
  if (!item.expires_on)
    return { level: "unknown", daysRemaining: null, expiresOn: null };
  const days = daysUntil(item.expires_on, now);
  const lead = item.warn_lead_days ?? 30;
  const level: ComplianceLevel =
    days < 0 ? "expired" : days <= lead ? "expiring" : "valid";
  return { level, daysRemaining: days, expiresOn: item.expires_on };
};

export interface ComplianceSummary {
  valid: number;
  expiring: number;
  expired: number;
  unknown: number;
  // "grounded" only when a roll-blocking (driver/vehicle) doc has expired; an
  // expired business doc counts but doesn't take the truck off the road.
  status: "cleared" | "grounded";
}

const rollBlocking = (scope: ComplianceScope) => scope !== "business";

export const complianceSummary = (
  items: Checkable[],
  now: Date,
): ComplianceSummary => {
  let valid = 0;
  let expiring = 0;
  let expired = 0;
  let unknown = 0;
  let grounded = false;
  for (const c of items) {
    const { level } = computeComplianceDue(c, now);
    if (level === "valid") valid++;
    else if (level === "expiring") expiring++;
    else if (level === "expired") {
      expired++;
      if (rollBlocking(c.scope)) grounded = true;
    } else unknown++;
  }
  return { valid, expiring, expired, unknown, status: grounded ? "grounded" : "cleared" };
};

// Expiring/expired docs as dashboard alerts, most-urgent first.
export const complianceAlerts = (items: Checkable[], now: Date): Alert[] => {
  const alerts: { alert: Alert; rank: number; days: number }[] = [];
  for (const c of items) {
    const due = computeComplianceDue(c, now);
    if (due.level !== "expired" && due.level !== "expiring") continue;
    const expired = due.level === "expired";
    const days = due.daysRemaining ?? 0;
    alerts.push({
      rank: expired ? 0 : 1,
      days,
      alert: {
        id: `compliance-${c.id}`,
        kind: "compliance",
        severity: expired ? "critical" : "warning",
        message: `${c.label} ${
          expired
            ? `expired ${Math.abs(days)}d ago`
            : `expires in ${days}d`
        }`,
        actionHref: c.actionHref ?? "/compliance",
      },
    });
  }
  return alerts
    .sort((a, b) => a.rank - b.rank || a.days - b.days)
    .map((a) => a.alert);
};
