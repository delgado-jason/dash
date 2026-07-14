import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Warehouse } from "lucide-react";
import type { Facility } from "@/types/facility";
import { getFacility, mergeFacilities } from "@/services/facilitiesService";
import { useFacilities } from "@/hooks/useFacilities";
import { useLoads } from "@/hooks/useLoads";
import { dwell } from "@/lib/stopTimes";
import { facilityStops, scoreStops } from "@/lib/metrics/stopScore";
import { StopScorecard } from "@/components/StopScorecard";
import { facilityLabel } from "@/lib/facilityMatch";
import { getSettlementSchedule } from "@/services/settlementScheduleService";

const fmtDate = (d?: string | null) =>
  d
    ? new Date(String(d).slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";

interface StopRow {
  loadId: string;
  loadNumber: string;
  role: "shipper" | "receiver";
  date?: string | null;
  dwell: string | null;
}

const FacilityDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [facility, setFacility] = useState<Facility | null>(null);
  const [freeHours, setFreeHours] = useState(3);
  const { loads } = useLoads(0);
  const { facilities } = useFacilities(0);
  const [mergeTarget, setMergeTarget] = useState("");
  const [merging, setMerging] = useState(false);

  // Merge THIS facility into another (the fallback for dupes the finder can't
  // auto-cluster). Reassigns its loads onto the target, then deletes this one.
  const doMerge = async () => {
    if (!id || !mergeTarget) return;
    setMerging(true);
    try {
      await mergeFacilities(mergeTarget, [id]);
      navigate(`/facilities/${mergeTarget}`);
    } catch {
      setMerging(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    getFacility(id)
      .then(setFacility)
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    getSettlementSchedule()
      .then((s) => setFreeHours(s.detention_free_hours))
      .catch(() => {});
  }, []);

  const score = useMemo(
    () => (id ? scoreStops(facilityStops(loads ?? [], id, freeHours)) : null),
    [loads, id, freeHours],
  );

  // Every stop this facility played on a load — as shipper and/or receiver.
  const rows = useMemo<StopRow[]>(() => {
    const out: StopRow[] = [];
    for (const l of loads ?? []) {
      if (l.shipper_facility_id === id)
        out.push({
          loadId: l.load_id,
          loadNumber: l.load_number,
          role: "shipper",
          date: l.pickup_date,
          dwell: dwell(l.shipper_in, l.shipper_out),
        });
      if (l.receiver_facility_id === id)
        out.push({
          loadId: l.load_id,
          loadNumber: l.load_number,
          role: "receiver",
          date: l.delivery_date,
          dwell: dwell(l.receiver_in, l.receiver_out),
        });
    }
    return out.sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? 1 : -1));
  }, [loads, id]);

  const role =
    rows.some((r) => r.role === "shipper") && rows.some((r) => r.role === "receiver")
      ? "ships · receives"
      : rows.some((r) => r.role === "shipper")
        ? "ships"
        : rows.some((r) => r.role === "receiver")
          ? "receives"
          : "—";

  if (!facility)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <p className="text-muted-text">Loading…</p>
      </div>
    );

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <Link to="/facilities" className="text-xs text-muted-text hover:text-light">
        ← Facilities
      </Link>

      <div className="flex gap-4 items-start mt-3 mb-6">
        <div className="w-14 h-14 rounded-xl bg-plate border border-steel flex items-center justify-center shrink-0">
          <Warehouse size={26} className="text-muted-text" />
        </div>
        <div>
          <h1 className="text-3xl font-condensed">
            {facilityLabel(facility)}{" "}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full align-middle font-body"
              style={
                facility.kind === "job_site"
                  ? { background: "#1e2740", color: "#9db2d8" }
                  : { background: "#12251a", color: "#6fd08c" }
              }
            >
              {facility.kind === "job_site" ? "job site" : "business"}
            </span>
          </h1>
          <p className="text-muted-text text-sm">
            {facility.city}, {facility.state}
            {facility.kind === "business" && facility.address
              ? ` · ${facility.address}`
              : ""}
            <span className="text-steel"> · </span>
            {role}
          </p>
        </div>
      </div>

      <div className="bg-plate rounded-lg p-4 mb-4">
        <p className="text-xs text-muted-text uppercase tracking-wider mb-3">
          Scorecard
        </p>
        <StopScorecard score={score} countLabel="Loads" countValue={rows.length} />
      </div>

      <div className="bg-plate rounded-lg p-4">
        <p className="text-xs text-muted-text uppercase tracking-wider mb-2">
          Loads through here
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-text">No loads through this facility yet.</p>
        ) : (
          <div className="text-sm divide-y divide-steel">
            {rows.map((r) => (
              <div
                key={`${r.loadId}-${r.role}`}
                className="py-2 flex justify-between gap-3"
              >
                <span>
                  <Link
                    to={`/loads/${r.loadId}`}
                    className="text-amber-light hover:underline font-medium"
                  >
                    {r.loadNumber}
                  </Link>
                  <span className="text-muted-text">
                    {" "}
                    · {r.role} · {fmtDate(r.date)}
                  </span>
                </span>
                <span className="text-muted-text">
                  {r.dwell ? `dwell ${r.dwell}` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <details className="mt-4 text-sm">
        <summary className="text-muted-text cursor-pointer">
          Merge this facility into another…
        </summary>
        <div className="mt-2 flex gap-2 items-center flex-wrap">
          <select
            className="bg-steel rounded px-2 py-1.5 text-sm text-light"
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
          >
            <option value="">Choose the facility to keep…</option>
            {facilities
              .filter((f) => f.facility_id !== id)
              .map((f) => (
                <option key={f.facility_id} value={f.facility_id}>
                  {facilityLabel(f)} · {f.city}, {f.state}
                </option>
              ))}
          </select>
          <button
            onClick={doMerge}
            disabled={!mergeTarget || merging}
            className="bg-amber text-steel text-xs px-3 py-1.5 rounded font-semibold disabled:opacity-50"
          >
            {merging ? "Merging…" : "Merge & delete this"}
          </button>
        </div>
        <p className="text-[11px] text-muted-text mt-1">
          Moves this facility's {rows.length} load{rows.length === 1 ? "" : "s"}{" "}
          onto the chosen one and deletes this facility. Can't be undone.
        </p>
      </details>
    </div>
  );
};

export default FacilityDetailPage;
