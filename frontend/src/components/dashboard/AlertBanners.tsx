import { useState } from "react";
import { Wrench, ShieldAlert, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import type { Alert } from "@/types/alert";

interface Props {
  alerts: Alert[];
  collapsedCount?: number; // how many to show before folding the rest
}

const styleFor = (severity: Alert["severity"]): string =>
  severity === "critical"
    ? "bg-status-negative-bg text-status-negative-text"
    : "bg-status-aware-bg text-status-aware-text";

const IconFor = ({ kind }: { kind: Alert["kind"] }) =>
  kind === "maintenance" ? (
    <Wrench size={15} className="shrink-0" aria-hidden="true" />
  ) : (
    <ShieldAlert size={15} className="shrink-0" aria-hidden="true" />
  );

const Row = ({ alert }: { alert: Alert }) => (
  <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] ${styleFor(alert.severity)}`}>
    <IconFor kind={alert.kind} />
    <span className="flex-1 truncate">{alert.message}</span>
    {alert.actionHref && (
      <Link to={alert.actionHref} className="underline whitespace-nowrap text-xs">
        View
      </Link>
    )}
  </div>
);

// Reserved dashboard region. Renders nothing with no alerts. Critical items sort
// first; only the top few show, the rest fold behind a summary toggle so a long
// overdue list can't swallow the whole glance.
export const AlertBanners = ({ alerts, collapsedCount = 2 }: Props) => {
  const [open, setOpen] = useState(false);
  if (alerts.length === 0) return null;

  const sorted = [...alerts].sort(
    (a, b) => (b.severity === "critical" ? 1 : 0) - (a.severity === "critical" ? 1 : 0),
  );
  const shown = open ? sorted : sorted.slice(0, collapsedCount);
  const hidden = sorted.length - shown.length;
  const maint = alerts.filter((a) => a.kind === "maintenance").length;
  const comp = alerts.length - maint;

  return (
    <div className="flex flex-col gap-1.5">
      <div className={open ? "flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1" : "flex flex-col gap-1.5"}>
        {shown.map((alert) => (
          <Row key={alert.id} alert={alert} />
        ))}
      </div>
      {(hidden > 0 || open) && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center justify-center gap-1.5 text-[11.5px] text-muted-text hover:text-light rounded-lg py-1"
          style={{ background: "#131a27", border: "1px solid #26304a" }}
        >
          <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          {open
            ? "Show less"
            : `+${hidden} more · ${maint} maintenance, ${comp} compliance`}
        </button>
      )}
    </div>
  );
};
