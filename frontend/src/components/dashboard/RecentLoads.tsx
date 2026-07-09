import { Link } from "react-router-dom";
import type { RecentLoad } from "@/lib/metrics/dashboard";

interface Props {
  loads: RecentLoad[];
}

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const fmtK = (n: number): string => `$${(n / 1000).toFixed(1)}k`;

export const RecentLoads = ({ loads }: Props) => {
  if (loads.length === 0)
    return <p className="text-muted-text text-sm">No delivered loads yet.</p>;

  return (
    <div>
      {loads.map((load) => (
        <Link
          key={load.load_id}
          to={`/loads/${load.load_id}`}
          className="flex justify-between items-center py-1.5 border-t border-steel first:border-t-0 hover:opacity-80"
        >
          <span className="text-sm text-light truncate">
            #{load.load_number} · {load.lane}
          </span>
          <span className="text-xs text-muted-text whitespace-nowrap ml-2">
            {fmtDate(load.delivery_date)} · {fmtK(load.revenue)}
          </span>
        </Link>
      ))}
    </div>
  );
};
