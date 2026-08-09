import { Link } from "react-router-dom";
import type { UpcomingLoad } from "@/lib/metrics/dashboard";
import { money } from "@/lib/format";

interface Props {
  loads: UpcomingLoad[];
}

// Weekday + date, in UTC to avoid the local-timezone day-shift on date-only strings.
const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const OVR = () => (
  <span
    className="text-[8px] font-extrabold tracking-wide px-1.5 py-0.5 rounded"
    style={{ color: "#f5b03a", background: "#3a2408", border: "1px solid #85560b" }}
  >
    OVR
  </span>
);

export const WhatsNext = ({ loads }: Props) => {
  if (loads.length === 0)
    return <p className="text-muted-text text-sm">Nothing booked.</p>;

  return (
    <div>
      {loads.map((load) => (
        <Link
          key={load.load_id}
          to={`/loads/${load.load_id}`}
          className="flex items-start justify-between gap-2 py-1.5 hover:opacity-80 border-t first:border-t-0 ds2-cell-rule"
        >
          <span className="min-w-0 flex flex-col">
            <span className="text-[12px] text-ink truncate flex items-center gap-1.5">
              {load.lane}
              {load.oversize && <OVR />}
            </span>
            <span className="text-[10px] text-dim truncate">{load.agent}</span>
          </span>
          <span className="shrink-0 text-right flex flex-col">
            <span className="text-[12px] font-bold">{money(load.gross)}</span>
            <span className="text-[10px] text-dim">{fmtDate(load.pickup_date)}</span>
          </span>
        </Link>
      ))}
    </div>
  );
};
