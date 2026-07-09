import type { Alert } from "@/types/alert";

interface Props {
  alerts: Alert[];
}

const styleFor = (severity: Alert["severity"]): string =>
  severity === "critical"
    ? "bg-status-negative-bg text-status-negative-text"
    : "bg-status-aware-bg text-status-aware-text";

const iconFor = (kind: Alert["kind"]): string =>
  kind === "maintenance" ? "ti-tool" : "ti-alert-circle";

// Reserved dashboard region. Renders nothing when there are no alerts, so it
// costs no space until the future alert engine feeds it.
export const AlertBanners = ({ alerts }: Props) => {
  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-4">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${styleFor(alert.severity)}`}
        >
          <i className={`ti ${iconFor(alert.kind)}`} aria-hidden="true" />
          <span className="flex-1">{alert.message}</span>
          {alert.actionHref && (
            <a href={alert.actionHref} className="underline whitespace-nowrap">
              View
            </a>
          )}
        </div>
      ))}
    </div>
  );
};
