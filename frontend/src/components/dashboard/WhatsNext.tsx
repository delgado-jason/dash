import { Link } from "react-router-dom";
import type { UpcomingLoad } from "@/lib/metrics/dashboard";

interface Props {
  loads: UpcomingLoad[];
}

// Format in UTC to avoid the local-timezone day-shift on date-only strings.
const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export const WhatsNext = ({ loads }: Props) => {
  if (loads.length === 0)
    return <p className="text-muted-text text-sm">Nothing booked.</p>;

  return (
    <div>
      {loads.map((load) => (
        <Link
          key={load.load_id}
          to={`/loads/${load.load_id}`}
          className="flex justify-between text-sm py-1.5 border-t border-steel first:border-t-0 hover:opacity-80"
        >
          <span className="text-light truncate">
            #{load.load_number} · {load.lane}
          </span>
          <span className="text-muted-text whitespace-nowrap ml-2">
            {fmtDate(load.pickup_date)}
          </span>
        </Link>
      ))}
    </div>
  );
};
