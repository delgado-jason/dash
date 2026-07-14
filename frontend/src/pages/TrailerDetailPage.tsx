import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import type { Trailer } from "@/types/trailer";
import type { MaintenanceItem, MaintenanceService } from "@/types/maintenance";
import { getTrailer, patchTrailer } from "@/services/trailersService";
import {
  getMaintenanceItems,
  getMaintenanceServices,
} from "@/services/maintenanceService";
import { useLoads } from "@/hooks/useLoads";
import {
  computeDue,
  recentMilesPerMonth,
  maxOdometer,
} from "@/lib/metrics/maintenance";
import { loadTrailerNet } from "@/lib/metrics/rateTargets";
import { computeTrailerMetrics } from "@/lib/metrics/trailerMetrics";
import {
  computeTrailerPatches,
  computeTrailerMedals,
  trailerRecords,
} from "@/lib/awards/trailerAwards";
import { earnedMedals } from "@/lib/awards/medals";
import { MedalBadge } from "@/components/awards/MedalBadge";
import { RecordBook, type RecordChip } from "@/components/awards/RecordBook";
import { PatchBoard } from "@/components/awards/PatchBoard";
import { getObligations } from "@/services/obligationsService";
import type { Obligation } from "@/types/obligation";
import { isPayoffTracked, assetLoanStatus } from "@/lib/metrics/payoff";
import { PayoffTracker } from "@/components/fleet/PayoffTracker";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";
import { EntityForm } from "@/components/fleet/EntityForm";
import { MileClub } from "@/components/fleet/MileClub";
import { TRAILER_FIELDS, toFormValues } from "@/lib/fleetFields";
import { formatDate } from "@/lib/format";
import { Panel } from "@/components/ui/Panel";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const num = (n: number) => Math.round(n).toLocaleString("en-US");

// One tile in the trailer-metrics strip.
const Kpi = ({
  value,
  label,
  sub,
  green,
}: {
  value: string;
  label: string;
  sub?: string;
  green?: boolean;
}) => (
  <div className="flex-1 min-w-[92px] rounded-[10px] px-2 py-2.5 text-center" style={{ background: "#1c2333" }}>
    <div className="font-comic text-[20px] leading-none" style={{ color: green ? "#4ade80" : "#f5e6c8" }}>
      {value}
    </div>
    <div className="text-[9px] text-muted-text mt-1 tracking-wide">{label}</div>
    {sub && <div className="text-[8px] text-muted-text">{sub}</div>}
  </div>
);

const Spec = ({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) => (
  <div>
    <p className="text-xs text-muted-text">{label}</p>
    <p className="text-sm">
      {value === null || value === undefined || value === "" ? "—" : value}
    </p>
  </div>
);

const TrailerDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { loads } = useLoads(0);
  const [trailer, setTrailer] = useState<Trailer | null>(null);
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [services, setServices] = useState<MaintenanceService[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getTrailer(id)
      .then(setTrailer)
      .catch(() => {});
    getMaintenanceItems()
      .then(setItems)
      .catch(() => {});
    getMaintenanceServices()
      .then(setServices)
      .catch(() => {});
    getObligations()
      .then(setObligations)
      .catch(() => {});
  }, [id]);

  // The loan tracked against this trailer, if any.
  const trailerLoan = obligations.find(
    (o) =>
      o.asset_type === "trailer" &&
      (o.asset_id === id || o.asset_id == null) &&
      isPayoffTracked(o),
  );

  // Latest hub reading, derived from the app: stored + newest trailer service.
  const hub = useMemo(() => {
    if (!trailer) return 0;
    const svcHubs = services
      .filter((s) => s.unit === "trailer" || s.unit === "both")
      .map((s) => s.trailer_hub);
    return maxOdometer(trailer.current_hub, ...svcHubs) ?? trailer.current_hub;
  }, [trailer, services]);

  const mpm = useMemo(() => recentMilesPerMonth(loads, new Date()), [loads]);
  const trailerLoads = useMemo(
    () => loads.filter((l) => l.trailer_id === id),
    [loads, id],
  );
  // Only earned freight — delivered AND paid. The trailer earns its share of
  // each load (loadTrailerNet: its % of linehaul + base-rate accessorials), not
  // the full net — the tractor earns the rest.
  const earnedLoads = useMemo(
    () =>
      trailerLoads.filter(
        (l) => l.load_status === "delivered" && l.payment_status === "paid",
      ),
    [trailerLoads],
  );
  const revenue = useMemo(
    () => earnedLoads.reduce((s, l) => s + loadTrailerNet(l), 0),
    [earnedLoads],
  );
  const due = useMemo(() => {
    let overdue = 0;
    let soon = 0;
    for (const it of items.filter((i) => i.trailer_id === id)) {
      const d = computeDue(it, hub, new Date(), mpm);
      if (d.level === "overdue") overdue++;
      else if (d.level === "soon") soon++;
    }
    return { overdue, soon };
  }, [items, id, hub, mpm]);

  const saveEdit = async (data: Record<string, unknown>) => {
    if (!trailer) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await patchTrailer(trailer.trailer_id, data);
      setTrailer(updated);
      setEditing(false);
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not save",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!trailer)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <p className="text-muted-text">Loading…</p>
      </div>
    );

  const now = new Date();
  const metrics = computeTrailerMetrics(trailer, trailerLoads, services, now);
  const trailerMedals = earnedMedals(
    computeTrailerMedals({
      hubMiles: hub,
      earnings: revenue,
      deliveredCount: earnedLoads.length,
      loanPaidPct: assetLoanStatus(obligations, "trailer", now)?.ownedPct ?? null,
    }),
  );
  const patches = computeTrailerPatches(trailerLoads);
  const recs = trailerRecords(trailerLoads);
  const recordChips: RecordChip[] = [
    { icon: "cash", color: "#4ade80", value: recs.bestPayday != null ? money(recs.bestPayday) : "—", label: "BEST PAYDAY (MO)" },
    { icon: "flag", color: "#f5b03a", value: recs.longestHaul != null ? num(recs.longestHaul) : "—", label: "LONGEST HAUL" },
    { icon: "weight", color: "#60a5fa", value: recs.heaviestLoad != null ? num(recs.heaviestLoad) : "—", label: "HEAVIEST LOAD (LB)" },
    { icon: "road", color: "#f5b03a", value: recs.bigMonthMiles != null ? num(recs.bigMonthMiles) : "—", label: "BIG MONTH (MI)" },
  ];

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <Link to="/trailers" className="text-xs text-muted-text hover:text-light">
        ← Trailers
      </Link>

      <div className="flex flex-col md:flex-row gap-6 mt-3 mb-6">
        <EntityAvatar
          kind="trailer"
          id={trailer.trailer_id}
          avatarUrl={trailer.avatar_url}
          size={180}
          onUpdated={(u) => setTrailer({ ...trailer, avatar_url: u })}
        />
        <div className="flex-1">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-condensed">
                Unit {trailer.unit_number}
              </h1>
              <p className="text-muted-text text-sm mb-4 capitalize">
                {trailer.trailer_type}
                {trailer.length_ft ? ` · ${trailer.length_ft}'` : ""} ·{" "}
                {trailer.status}
              </p>
              {!editing && trailerMedals.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {trailerMedals.map((m) => (
                    <MedalBadge key={m.key} medal={m} />
                  ))}
                </div>
              )}
            </div>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="bg-steel text-light px-2 py-1 rounded text-xs flex items-center gap-1"
              >
                <Pencil size={13} /> Edit
              </button>
            )}
          </div>

          {editing ? (
            <EntityForm
              title="Edit trailer"
              fields={TRAILER_FIELDS}
              initial={toFormValues(
                trailer as unknown as Record<string, unknown>,
                TRAILER_FIELDS,
              )}
              onSave={saveEdit}
              onCancel={() => setEditing(false)}
              busy={busy}
              error={error}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Spec
                  label="Hubodometer · latest"
                  value={`${hub.toLocaleString("en-US")} mi`}
                />
                <Spec label="VIN" value={trailer.vin} />
                <Spec
                  label="Plate"
                  value={
                    trailer.plate_number
                      ? `${trailer.plate_number} ${trailer.plate_state || ""}`
                      : null
                  }
                />
                <Spec
                  label="Make"
                  value={[trailer.year, trailer.make, trailer.model]
                    .filter(Boolean)
                    .join(" ")}
                />
                <Spec
                  label="In service"
                  value={formatDate(trailer.in_service_date)}
                />
              </div>
              <MileClub miles={hub} unit="hub" />
            </>
          )}
        </div>
      </div>

      <div className="mt-1">
        <p className="text-xs text-muted-text mb-2">
          Trailer metrics{" "}
          <span className="text-[11px]" style={{ color: "#5b6b82" }}>
            · no fuel line — a trailer has no engine
          </span>
        </p>
        <div className="flex gap-2 flex-wrap">
          <div
            className="flex-[1.4] min-w-[130px] rounded-[10px] px-3 py-2.5 text-center"
            style={{ background: "#0f2419", border: "1px solid #2f6f52" }}
          >
            <div className="font-comic text-2xl leading-none" style={{ color: "#4ade80" }}>
              {metrics.utilization != null ? `${Math.round(metrics.utilization * 100)}%` : "—"}
            </div>
            <div className="text-[9px] mt-1 tracking-wide" style={{ color: "#8fd6a8" }}>
              UTILIZATION · ACTIVE WEEKS
            </div>
          </div>
          <Kpi
            value={metrics.earningsPerMile != null ? `$${metrics.earningsPerMile.toFixed(2)}` : "—"}
            label="EARNINGS / MI"
            sub="its 8% share"
            green
          />
          <Kpi
            value={metrics.costToRunPerMile != null ? `$${metrics.costToRunPerMile.toFixed(2)}` : "—"}
            label="COST TO RUN / MI"
            sub="maintenance only"
          />
          <Kpi value={metrics.milesPerMonth != null ? num(metrics.milesPerMonth) : "—"} label="MI / MONTH" />
        </div>
      </div>

      {trailerLoan && <PayoffTracker obligation={trailerLoan} kind="trailer" />}

      <RecordBook records={recordChips} />
      <PatchBoard patches={patches} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <Link
          to="/maintenance"
          className="ds-panel ds-panel--default ds-panel--interactive p-4 block"
        >
          <p className="text-xs text-muted-text mb-2">Maintenance</p>
          <div className="flex gap-3 text-sm">
            <span style={{ color: "#e24b4a" }}>{due.overdue} overdue</span>
            <span style={{ color: "#e8940a" }}>{due.soon} due soon</span>
          </div>
        </Link>
        <Panel className="p-4">
          <p className="text-xs text-muted-text mb-1">Loads hauled</p>
          <p className="text-2xl font-condensed">{earnedLoads.length}</p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted-text mb-1">Trailer earnings · all time</p>
          <p className="text-2xl font-condensed">{money(revenue)}</p>
          <p className="text-[11px] text-muted-text mt-1">
            its cut of every load it carried
          </p>
        </Panel>
      </div>
    </div>
  );
};

export default TrailerDetailPage;
