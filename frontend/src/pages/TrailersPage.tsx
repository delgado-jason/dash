import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Trailer } from "@/types/trailer";
import type { MaintenanceItem, MaintenanceService } from "@/types/maintenance";
import type { Obligation } from "@/types/obligation";
import { getTrailers, createTrailer } from "@/services/trailersService";
import {
  getMaintenanceItems,
  getMaintenanceServices,
} from "@/services/maintenanceService";
import { getObligations } from "@/services/obligationsService";
import { useLoads } from "@/hooks/useLoads";
import { computeDue, recentMilesPerMonth, maxOdometer } from "@/lib/metrics/maintenance";
import { computePayoff, isPayoffTracked } from "@/lib/metrics/payoff";
import { loadTrailerNet } from "@/lib/metrics/rateTargets";
import { mileMilestone } from "@/lib/metrics/mileClub";
import { AvatarFallback } from "@/components/fleet/AvatarFallback";
import { EntityForm, type FormField } from "@/components/fleet/EntityForm";
import { Skeleton } from "@/components/ui/skeleton";
import { RowsSkeleton } from "@/components/ui/PageSkeletons";
import { money } from "@/lib/format";

const FIELDS: FormField[] = [
  {
    name: "unit_number",
    label: "Unit #",
    required: true,
    placeholder: "780991",
  },
  {
    name: "trailer_type",
    label: "Type",
    type: "select",
    options: [
      "flatbed",
      "step deck",
      "RGN",
      "lowboy",
      "double drop",
      "conestoga",
    ],
  },
  {
    name: "length_ft",
    label: "Length (ft)",
    type: "number",
    placeholder: "48",
  },
  { name: "make", label: "Make", placeholder: "Utility" },
  { name: "model", label: "Model" },
  { name: "year", label: "Year", type: "number", placeholder: "2019" },
  { name: "vin", label: "VIN" },
  { name: "plate_number", label: "Plate", placeholder: "DTS780" },
  { name: "plate_state", label: "State", placeholder: "AL" },
  {
    name: "current_hub",
    label: "Hubodometer (seed — services keep it fresh)",
    type: "number",
    placeholder: "456123",
  },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: ["active", "maintenance", "out_of_service", "inactive"],
  },
  { name: "in_service_date", label: "In service", type: "date" },
];

const STATUS_CHIP: Record<string, string> = {
  active: "text-[#6fd08c] border-[rgba(111,208,140,.35)] bg-[rgba(111,208,140,.08)]",
  maintenance: "text-amber-hi border-[rgba(232,148,10,.45)] bg-[rgba(232,148,10,.1)]",
  out_of_service: "text-[#e05252] border-[rgba(224,82,82,.45)] bg-[rgba(224,82,82,.1)]",
  inactive: "text-faint border-hairline",
};

const kMoney = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : money(n);

const TrailersPage = () => {
  const { loads } = useLoads(0);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [services, setServices] = useState<MaintenanceService[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = () =>
    getTrailers()
      .then(setTrailers)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    getMaintenanceItems().then(setItems).catch(() => {});
    getMaintenanceServices().then(setServices).catch(() => {});
    getObligations().then(setObligations).catch(() => {});
  }, []);

  // Per-trailer roster line: miles carried, hauls, its 8% share, note %, clocks.
  const now = useMemo(() => new Date(), []);
  const mpm = useMemo(() => recentMilesPerMonth(loads, now), [loads, now]);
  const rows = useMemo(
    () =>
      trailers.map((t) => {
        const mine = loads.filter(
          (l) => l.trailer_id === t.trailer_id && l.load_status === "delivered",
        );
        const miles = mine.reduce((s, l) => {
          const a = Number(l.odometer_start);
          const b = Number(l.odometer_end);
          return l.odometer_start != null && l.odometer_end != null && b > a
            ? s + (b - a)
            : s;
        }, 0);
        const share = mine
          .filter((l) => l.payment_status === "paid")
          .reduce((s, l) => s + loadTrailerNet(l), 0);
        const loan = obligations.find(
          (o) =>
            o.asset_type === "trailer" &&
            (o.asset_id === t.trailer_id || o.asset_id == null) &&
            isPayoffTracked(o),
        );
        const payoff = loan ? computePayoff(loan, now) : null;
        // The trailer's clocks run on the hub scale — seed + service readings.
        const hub =
          maxOdometer(
            t.current_hub,
            ...services
              .filter((s) => s.unit === "trailer" || s.unit === "both")
              .map((s) => s.trailer_hub),
          ) ?? t.current_hub;
        let overdue = 0;
        let soon = 0;
        for (const it of items.filter(
          (i) =>
            i.active &&
            i.unit === "trailer" &&
            (i.trailer_id === t.trailer_id || i.trailer_id == null),
        )) {
          const d = computeDue(it, hub, now, mpm);
          if (d.level === "overdue") overdue++;
          else if (d.level === "soon") soon++;
        }
        return {
          t,
          miles,
          hauls: mine.length,
          share,
          payoff,
          overdue,
          soon,
          m: mileMilestone(miles),
        };
      }),
    [trailers, loads, obligations, items, services, mpm, now],
  );

  const save = async (data: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await createTrailer(data);
      setShowForm(false);
      await load();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not create the trailer";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-8 w-32 mb-6" />
        <RowsSkeleton rows={3} />
      </div>
    );

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">TRAILERS</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            the deck that carries it
          </span>
          <span className="flex-1" />
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[14px] tracking-[.05em] text-canvas"
              style={{
                background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
                boxShadow:
                  "0 5px 14px rgba(232,148,10,.3), inset 0 1px 0 rgba(255,255,255,.5)",
              }}
            >
              + ADD TRAILER
            </button>
          )}
        </div>

        {showForm && (
          <div className="mt-4 max-w-md">
            <EntityForm
              title="New trailer"
              fields={FIELDS}
              onSave={save}
              onCancel={() => setShowForm(false)}
              busy={busy}
              error={error}
            />
          </div>
        )}

        {trailers.length === 0 ? (
          <p className="text-faint font-condensed text-[14px] mt-5">
            No trailers yet. Add one to get started.
          </p>
        ) : (
          <div className="ds2-board overflow-hidden mt-4">
            {rows.map(({ t, miles, hauls, share, payoff, overdue, soon, m }) => (
              <div
                key={t.trailer_id}
                onClick={() => navigate(`/trailers/${t.trailer_id}`)}
                className="flex items-center gap-4 px-4 py-[13px] border-t ds2-cell-rule first:border-t-0 cursor-pointer hover:bg-well/60"
              >
                <div className="w-14 h-14 rounded-[10px] overflow-hidden bg-well border border-hairline shrink-0">
                  {t.avatar_url ? (
                    <img src={t.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <AvatarFallback kind="trailer" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-condensed font-semibold text-[17px] flex items-center gap-[9px] flex-wrap">
                    UNIT {t.unit_number}
                    <span className="font-medium text-[10.5px] tracking-[.1em] px-[7px] py-[2px] rounded-[4px] text-faint border border-hairline uppercase">
                      {[t.year, t.make, t.model].filter(Boolean).join(" ")}
                      {t.trailer_type
                        ? ` · ${t.length_ft ? `${t.length_ft}′ ` : ""}${t.trailer_type}`
                        : ""}
                    </span>
                    <span
                      className={`font-bold text-[10.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] border uppercase ${
                        STATUS_CHIP[t.status] ?? STATUS_CHIP.inactive
                      }`}
                    >
                      {t.status.replace(/_/g, " ")}
                    </span>
                    {overdue > 0 && (
                      <span className="font-bold text-[10.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-[#e05252] border border-[rgba(224,82,82,.45)] bg-[rgba(224,82,82,.1)]">
                        {overdue} OVERDUE
                      </span>
                    )}
                    {overdue === 0 && soon > 0 && (
                      <span className="font-bold text-[10.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-amber-hi border border-[rgba(232,148,10,.45)] bg-[rgba(232,148,10,.1)]">
                        {soon} SERVICE{soon === 1 ? "" : "S"} CLOSE
                      </span>
                    )}
                  </div>
                  <div className="font-condensed text-[13px] text-dim mt-[3px]">
                    {miles.toLocaleString("en-US")} mi carried · {hauls} haul
                    {hauls === 1 ? "" : "s"} · its share {kMoney(share)}
                    {payoff?.paidPct != null
                      ? ` · note ${Math.round(payoff.paidPct * 100)}% paid`
                      : ""}
                  </div>
                </div>
                {m.crossed != null ? (
                  <span
                    className="font-display text-[12.5px] tracking-[.12em] rounded-[4px] px-[9px] pt-[3px] pb-[2px] rotate-[-1.2deg] whitespace-nowrap"
                    style={{
                      color: "#f0c24a",
                      border: "1.5px solid rgba(240,194,74,.55)",
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,.15), 0 1px 2px rgba(0,0,0,.5)",
                    }}
                  >
                    {m.label} CLUB
                  </span>
                ) : (
                  <span className="font-display text-[12.5px] tracking-[.12em] rounded-[4px] px-[9px] pt-[3px] pb-[2px] text-faint border border-dashed border-hairline whitespace-nowrap">
                    {m.next >= 1_000_000
                      ? `${m.next / 1_000_000}M`
                      : `${Math.round(m.next / 1000)}K`}{" "}
                    AT {Math.round((1 - m.pct) * 100)}% OUT
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrailersPage;
