import { Wrench, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import type { Alert } from "@/types/alert";

interface Props {
  alerts: Alert[];
}

const styleFor = (severity: Alert["severity"]): string =>
  severity === "critical"
    ? "bg-status-negative-bg text-status-negative-text"
    : "bg-status-aware-bg text-status-aware-text";

const IconFor = ({ kind }: { kind: Alert["kind"] }) =>
  kind === "maintenance" ? (
    <Wrench size={16} className="shrink-0" aria-hidden="true" />
  ) : (
    <ShieldAlert size={16} className="shrink-0" aria-hidden="true" />
  );

// Reserved dashboard region. Renders nothing when there are no alerts, so it
// costs no space until something (maintenance, compliance) feeds it.
export const AlertBanners = ({ alerts }: Props) => {
  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-4">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${styleFor(alert.severity)}`}
        >
          <IconFor kind={alert.kind} />
          <span className="flex-1">{alert.message}</span>
          {alert.actionHref && (
            <Link to={alert.actionHref} className="underline whitespace-nowrap">
              View
            </Link>
          )}
        </div>
      ))}
    </div>
  );
};
