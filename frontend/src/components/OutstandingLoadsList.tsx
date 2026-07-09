import { Link } from "react-router-dom";
import {
  getOutstandingSummary,
  type OutstandingLoad,
} from "@/lib/metrics/dashboard";

interface Props {
  loads: OutstandingLoad[];
}

const formatCurrency = (n: number): string =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

// Color the aging: older = more urgent
const ageColor = (days: number): string => {
  if (days >= 30) return "text-status-negative-text"; // 30+ days → red
  if (days >= 15) return "text-status-aware-text"; // 15-29 → amber
  return "text-muted-text"; // under 15 → muted
};

export const OutstandingLoadsList = ({ loads }: Props) => {
  const { total, avgDaysOutstanding } = getOutstandingSummary(loads);

  return (
    <div className="bg-plate rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-medium text-light">Outstanding loads</h3>
        <span className="text-sm text-status-aware-text font-medium">
          {formatCurrency(total)} owed
          {avgDaysOutstanding !== null && (
            <span className="text-muted-text font-normal">
              {" "}
              · avg {Math.round(avgDaysOutstanding)}d out
            </span>
          )}
        </span>
      </div>

      {loads.length === 0 ? (
        <p className="text-sm text-muted-text italic py-4">
          Nothing outstanding — all paid up.
        </p>
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
                {formatCurrency(load.revenue)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
