// Dashboard alert model. The banner region renders these; the engine that
// GENERATES them (maintenance from mileage/service intervals, compliance from
// doc-expiry dates) is a later arc. For now the source is an empty array.
export type AlertKind = "maintenance" | "compliance";
export type AlertSeverity = "warning" | "critical";

export interface Alert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
  actionHref?: string;
}
