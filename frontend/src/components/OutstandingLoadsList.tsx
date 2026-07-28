import { Link } from "react-router-dom";
import {
  getOutstandingSummary,
  type OutstandingLoad,
} from "@/lib/metrics/dashboard";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { money } from "@/lib/format";

interface Props {
  loads: OutstandingLoad[];
}

// Color the aging: older = more urgent
const ageColor = (days: number): string => {
  if (days >= 30) return "text-status-negative-text"; // 30+ days → red
  if (days >= 15) return "text-status-aware-text"; // 15-29 → amber
  return "text-muted-text"; // under 15 → muted
};

export const OutstandingLoadsList = ({ loads }: Props) => {
  const { total, medianDaysOutstanding, oldestDaysOutstanding } =
    getOutstandingSummary(loads);

  return (
    <Panel variant="panel" noir className="p-4">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-medium text-light">Outstanding loads</h3>
        <span className="text-sm text-status-aware-text font-medium">
          {money(total)} owed
          {medianDaysOutstanding !== null && (
            <span className="text-muted-text font-normal">
              {" "}
              · median {Math.round(medianDaysOutstanding)}d
            </span>
          )}
          {oldestDaysOutstanding !== null &&
            medianDaysOutstanding !== null &&
            oldestDaysOutstanding > Math.round(medianDaysOutstanding) && (
              <span className={`font-normal ${ageColor(oldestDaysOutstanding)}`}>
                {" "}
                · oldest {oldestDaysOutstanding}d
              </span>
            )}
        </span>
      </div>

      {loads.length === 0 ? (
        <EmptyState title="All paid up" hint="Nothing outstanding — clean books." />
      ) : (
        <div className="flex flex-col gap-2">
          {loads.map((load) => (
            <Link
              key={load.load_id}
              to={`/loads/${load.load_id}`}
              className="flex items-center justify-between py-2 border-b border-iron last:border-b-0 hover:opacity-80"
            >
              <div>
                <p className="text-sm text-foreground">{load.load_number}</p>
                <p className={`text-xs ${ageColor(load.daysOutstanding)}`}>
                  {load.broker} · {load.daysOutstanding} days
                </p>
              </div>
              <span className="text-sm text-status-aware-text font-medium">
                {money(load.revenue)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
};
