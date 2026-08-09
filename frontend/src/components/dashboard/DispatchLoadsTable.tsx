import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight, Truck } from "lucide-react";
import type { Load } from "@/types/load";
import { Panel } from "@/components/ui/Panel";
import {
  detentionOwed,
  detentionEligible,
  detentionMinutes,
} from "@/lib/detention";
import { fmtDuration } from "@/lib/stopTimes";

const PAGE = 10;

type Filter = "all" | "booked" | "in_transit" | "delivered" | "detention";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "booked", label: "Booked" },
  { key: "in_transit", label: "In transit" },
  { key: "delivered", label: "Delivered" },
  { key: "detention", label: "Detention" },
];

const STATUS_COLOR: Record<string, string> = {
  booked: "#8fb9ff",
  in_transit: "#4ade80",
  delivered: "#9daabb",
  cancelled: "#f87171",
  tonu: "#f5c37a",
};
const STATUS_LABEL: Record<string, string> = {
  booked: "booked",
  in_transit: "in transit",
  delivered: "delivered",
  cancelled: "cancelled",
  tonu: "TONU",
};

const lane = (l: Load): string => `${l.origin_market} → ${l.delivery_market}`;

// Format in UTC to dodge the local-timezone day-shift on date-only strings.
const fmtDate = (iso: string | null | undefined): string =>
  !iso
    ? "—"
    : new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });

// The date that matters for the row: delivered → when it delivered, otherwise
// when it picks up.
const rowDate = (l: Load): string | null | undefined =>
  l.load_status === "delivered" ? l.delivery_date : l.pickup_date;

const StatusChip = ({ status }: { status: string }) => (
  <span style={{ color: STATUS_COLOR[status] ?? "#9daabb" }}>
    {STATUS_LABEL[status] ?? status}
  </span>
);

export const DispatchLoadsTable = ({
  loads,
  freeHours,
}: {
  loads: Load[];
  freeHours: number;
}) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);

  // Any change to what's shown snaps back to the first page.
  useEffect(() => setPage(0), [search, filter]);

  // The one (or few) loads on the road right now — pulled out on top.
  const active = useMemo(
    () => loads.filter((l) => l.load_status === "in_transit"),
    [loads],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const searchMatch = (l: Load) =>
      !q ||
      [
        l.load_number,
        l.broker,
        l.agent,
        l.origin_market,
        l.delivery_market,
        l.origin_city,
        l.origin_state,
        l.destination_city,
        l.destination_state,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    const statusMatch = (l: Load) =>
      filter === "all"
        ? true
        : filter === "detention"
          ? detentionOwed(l) || detentionEligible(l, freeHours)
          : l.load_status === filter;

    return loads
      .filter((l) => searchMatch(l) && statusMatch(l))
      .sort((a, b) => (rowDate(b) ?? "").localeCompare(rowDate(a) ?? ""));
  }, [loads, search, filter, freeHours]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const clamped = Math.min(page, pages - 1);
  const start = clamped * PAGE;
  const shown = filtered.slice(start, start + PAGE);

  return (
    <Panel className="p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-forge font-bold text-lg" style={{ color: "var(--color-amber-hi)" }}>
          LOADS
        </span>
      </div>

      <div className="flex items-center gap-2 bg-[#141a26] border border-[#2a3347] rounded-md px-2.5 py-1.5 mb-2.5">
        <Search size={13} className="text-dim shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search # · lane · city"
          className="bg-transparent outline-none text-sm text-ink placeholder:text-dim w-full"
        />
      </div>

      {active.length > 0 && (
        <div className="mb-2.5 flex flex-col gap-1.5">
          {active.slice(0, 2).map((l) => (
            <Link
              key={l.load_id}
              to={`/loads/${l.load_id}`}
              className="block rounded-lg px-2.5 py-1.5 hover:opacity-90"
              style={{ background: "#132234", border: "1px solid #2b5a8c" }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] flex items-center gap-1"
                  style={{ color: "#60a5fa" }}
                >
                  <Truck size={11} /> ON THE ROAD
                </span>
                <span className="text-[10px] text-dim">
                  del {fmtDate(l.delivery_date)}
                </span>
              </div>
              <div className="text-sm text-ink truncate">
                #{l.load_number} · {lane(l)}
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap mb-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="rounded-full px-2.5 py-0.5 text-[11px]"
            style={
              filter === f.key
                ? { background: "#e8940a", color: "#10151f", fontWeight: 600 }
                : { background: "#232c3f", color: "#cdd8e8" }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[46px_1fr_66px_46px] text-[10px] text-dim uppercase tracking-wide px-1 pb-1.5 border-b border-steel">
        <span>Load</span>
        <span>Lane</span>
        <span>Status</span>
        <span className="text-right">Date</span>
      </div>

      {shown.length === 0 ? (
        <p className="text-dim text-sm py-4 text-center">
          No loads match.
        </p>
      ) : (
        shown.map((l) => {
          const owed = detentionOwed(l);
          const eligible = detentionEligible(l, freeHours);
          return (
            <Link
              key={l.load_id}
              to={`/loads/${l.load_id}`}
              className="grid grid-cols-[46px_1fr_66px_46px] items-center text-[11px] py-1.5 px-1 border-b border-[#202838] last:border-b-0 hover:opacity-80"
            >
              <span style={{ color: "#8fb9ff" }} className="underline">
                #{l.load_number}
              </span>
              <span className="text-ink truncate flex items-center gap-1.5">
                <span className="truncate">{lane(l)}</span>
                {owed && (
                  <span
                    className="shrink-0 rounded px-1 text-[9px]"
                    style={{ background: "#7a4718", color: "#f5c37a" }}
                  >
                    {fmtDuration(detentionMinutes(l, freeHours))}
                  </span>
                )}
                {eligible && (
                  <span
                    className="shrink-0 rounded px-1 text-[9px]"
                    style={{ color: "#8b98a9" }}
                  >
                    det?
                  </span>
                )}
              </span>
              <span className="text-[11px]">
                <StatusChip status={l.load_status} />
              </span>
              <span className="text-right text-dim">
                {fmtDate(rowDate(l))}
              </span>
            </Link>
          );
        })
      )}

      <div className="flex items-center justify-between mt-2.5">
        <span className="text-[11px] text-dim">
          {filtered.length === 0
            ? "0 loads"
            : `${start + 1}–${start + shown.length} of ${filtered.length}`}
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={() => setPage(clamped - 1)}
            disabled={clamped === 0}
            className="w-6 h-5 rounded flex items-center justify-center disabled:opacity-30"
            style={{ background: "#232c3f", color: "#cdd8e8" }}
            aria-label="Previous page"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            onClick={() => setPage(clamped + 1)}
            disabled={clamped >= pages - 1}
            className="w-6 h-5 rounded flex items-center justify-center disabled:opacity-30"
            style={{ background: "#232c3f", color: "#cdd8e8" }}
            aria-label="Next page"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </Panel>
  );
};
