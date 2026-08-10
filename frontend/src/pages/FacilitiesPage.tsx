import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useFacilities } from "@/hooks/useFacilities";
import { useLoads } from "@/hooks/useLoads";
import { FacilityCreateForm } from "@/components/FacilityCreateForm";
import { KindChip } from "@/components/facilities/KindChip";
import { Skeleton } from "@/components/ui/skeleton";
import { RowsSkeleton } from "@/components/ui/PageSkeletons";
import { facilityLabel, possibleDuplicates } from "@/lib/facilityMatch";
import {
  facilityTimes,
  timedStopCount,
  SLOW_DWELL_MIN,
  type FacilityTimes,
} from "@/lib/metrics/facilityLedger";
import { fmtDuration } from "@/lib/stopTimes";
import { mergeFacilities } from "@/services/facilitiesService";
import { formatDate } from "@/lib/format";
import type { FacilityRow } from "@/types/facility";

const loadCount = (f: FacilityRow) => f.as_shipper + f.as_receiver;

const roleLabel = (f: FacilityRow): string =>
  f.as_shipper && f.as_receiver
    ? "ships · receives"
    : f.as_shipper
      ? "ships"
      : f.as_receiver
        ? "receives"
        : "—";

const FacilitiesPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const { facilities, isLoading } = useFacilities(refreshKey);
  const { loads } = useLoads(0);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [keeperSel, setKeeperSel] = useState<Record<string, string>>({});
  const [confirmCluster, setConfirmCluster] = useState<FacilityRow[] | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeErr, setMergeErr] = useState<string | null>(null);
  const navigate = useNavigate();

  const dupes = useMemo(() => possibleDuplicates(facilities), [facilities]);
  const clusterKey = (c: FacilityRow[]) => c[0].facility_id;
  const defaultKeeper = (c: FacilityRow[]) =>
    [...c].sort((a, b) => loadCount(b) - loadCount(a))[0].facility_id;
  const keeperFor = (c: FacilityRow[]) =>
    keeperSel[clusterKey(c)] ?? defaultKeeper(c);

  const runMerge = async () => {
    if (!confirmCluster) return;
    const keeperId = keeperFor(confirmCluster);
    const mergeIds = confirmCluster
      .filter((f) => f.facility_id !== keeperId)
      .map((f) => f.facility_id);
    setMerging(true);
    setMergeErr(null);
    try {
      await mergeFacilities(keeperId, mergeIds);
      setConfirmCluster(null);
      setRefreshKey((p) => p + 1);
    } catch (e) {
      setMergeErr(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Merge failed",
      );
    } finally {
      setMerging(false);
    }
  };

  // The per-facility time story, computed once per loads/facilities change.
  const times = useMemo(() => {
    const map = new Map<string, FacilityTimes>();
    for (const f of facilities) map.set(f.facility_id, facilityTimes(loads ?? [], f.facility_id));
    return map;
  }, [facilities, loads]);

  const timedTotal = useMemo(() => timedStopCount(loads ?? []), [loads]);
  const repeats = useMemo(
    () => facilities.filter((f) => loadCount(f) > 1).length,
    [facilities],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? facilities.filter((f) =>
          `${f.name ?? ""} ${f.address ?? ""} ${f.city} ${f.state}`
            .toLowerCase()
            .includes(q),
        )
      : facilities;
    // Repeats first, then most recently visited, then name — the docks with a
    // story lead the ledger.
    return [...list].sort((a, b) => {
      const d = loadCount(b) - loadCount(a);
      if (d !== 0) return d;
      const la = times.get(a.facility_id)?.lastVisit ?? "";
      const lb = times.get(b.facility_id)?.lastVisit ?? "";
      if (la !== lb) return la < lb ? 1 : -1;
      return (a.name ?? a.address ?? "").localeCompare(b.name ?? b.address ?? "");
    });
  }, [facilities, search, times]);

  if (isLoading)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-8 w-36 mb-6" />
        <RowsSkeleton rows={10} />
      </div>
    );

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">FACILITIES</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            every dock you've backed into
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
              + ADD FACILITY
            </button>
          )}
        </div>

        {/* answering line */}
        <div className="flex items-center gap-3 flex-wrap mt-4">
          <span className="font-display text-[21px] tracking-[.03em] tabular-nums">
            {facilities.length} FACILIT{facilities.length === 1 ? "Y" : "IES"}
          </span>
          <span className="font-condensed text-[13px] text-faint">
            · <b className="font-semibold text-ink">{repeats}</b> repeat stops ·{" "}
            <b className="font-semibold text-ink">{timedTotal}</b> timed stops logged
          </span>
          <input
            className="ml-auto h-[34px] px-3 rounded-[9px] bg-well font-condensed text-[13px] text-ink placeholder:text-faint min-w-[210px] outline-none"
            style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}
            placeholder="⌕  search name, address, city…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {showForm && (
          <div className="mt-4 max-w-md">
            <FacilityCreateForm
              facilities={facilities}
              onResolved={() => {
                setShowForm(false);
                setRefreshKey((p) => p + 1);
              }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* possible duplicates — appears only when the finder flags */}
        {dupes.length > 0 && (
          <div className="ds2-board overflow-hidden mt-4" style={{ borderColor: "rgba(232,148,10,.4)" }}>
            <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
              <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-amber-hi">
                Possible duplicates
              </span>
              <span className="font-condensed text-[12px] text-faint">
                · pick the one to keep
              </span>
            </div>
            {dupes.map((cluster) => {
              const keeperId = keeperFor(cluster);
              return (
                <div key={clusterKey(cluster)} className="px-4 py-3 border-t ds2-cell-rule first:border-t-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-condensed font-semibold text-[14px] text-amber-hi">
                      {cluster[0].city}, {cluster[0].state}
                    </span>
                    <KindChip kind={cluster[0].kind} />
                    <button
                      onClick={() => setConfirmCluster(cluster)}
                      className="ml-auto h-8 px-[13px] rounded-[9px] font-condensed font-semibold text-[13px] text-amber-hi bg-well border border-amber/35"
                      style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,.5)" }}
                    >
                      MERGE {cluster.length - 1} INTO KEEPER →
                    </button>
                  </div>
                  {cluster.map((f) => (
                    <label
                      key={f.facility_id}
                      className="flex items-center gap-2.5 py-[7px] border-t ds2-cell-rule cursor-pointer font-condensed text-[14px] first-of-type:border-t-0 mt-1"
                    >
                      <input
                        type="radio"
                        checked={keeperId === f.facility_id}
                        onChange={() =>
                          setKeeperSel((s) => ({
                            ...s,
                            [clusterKey(cluster)]: f.facility_id,
                          }))
                        }
                        style={{ accentColor: "var(--color-amber)" }}
                      />
                      <span className="flex-1 min-w-0 truncate">{facilityLabel(f)}</span>
                      <span className="text-faint text-[12px]">{loadCount(f)} loads</span>
                      {keeperId === f.facility_id && (
                        <span className="font-condensed font-bold text-[10px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-canvas bg-amber-hi">
                          KEEPER
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* the ledger */}
        {facilities.length === 0 ? (
          <p className="text-faint font-condensed text-[14px] mt-5">
            No facilities yet. They're created as you add loads, or add one here.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-faint font-condensed text-[14px] mt-5">
            No facilities match "{search}".
          </p>
        ) : (
          <div className="ds2-board overflow-hidden mt-4">
            <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
              <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
                The ledger
              </span>
              <span className="font-condensed text-[12px] text-faint">
                · repeats first, then by last visit
              </span>
            </div>
            {filtered.map((f) => {
              const t = times.get(f.facility_id);
              const visits = loadCount(f);
              const dwellStr =
                t && t.medianDwellMin != null ? fmtDuration(t.medianDwellMin) : null;
              const slow = t && t.medianDwellMin != null && t.medianDwellMin >= SLOW_DWELL_MIN;
              return (
                <div
                  key={f.facility_id}
                  onClick={() => navigate(`/facilities/${f.facility_id}`)}
                  className={`flex items-center gap-[14px] px-4 py-3 border-t ds2-cell-rule first:border-t-0 cursor-pointer hover:bg-well/60 ${
                    visits < 2 ? "opacity-55 hover:opacity-100" : ""
                  }`}
                >
                  <span className="w-[52px] text-right shrink-0">
                    <span className="font-display text-[19px] tracking-[.04em] tabular-nums block leading-none">
                      {visits}
                    </span>
                    <span className="font-condensed text-[10.5px] text-faint tracking-[.08em]">
                      VISIT{visits === 1 ? "" : "S"}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-condensed font-semibold text-[16px] flex items-center gap-[9px] flex-wrap">
                      {facilityLabel(f)}
                      <KindChip kind={f.kind} />
                    </div>
                    <div className="font-condensed text-[13px] text-dim mt-[3px]">
                      {f.city}, {f.state} · {roleLabel(f)}
                      {t?.lastVisit ? ` · last in ${formatDate(t.lastVisit)}` : ""}
                    </div>
                  </div>
                  {dwellStr ? (
                    <span
                      className={`text-right font-condensed font-semibold text-[14px] tabular-nums ${
                        slow ? "text-[#f0a35e]" : ""
                      }`}
                    >
                      {dwellStr}
                      <span className="block font-medium text-[11px] text-faint tracking-[.05em]">
                        {t!.timed === 1 ? "1 timed stop" : `median · ${t!.timed} timed`}
                      </span>
                    </span>
                  ) : (
                    <span className="font-condensed text-[11.5px] text-faint border border-dashed border-hairline rounded-[6px] px-2 py-[3px] whitespace-nowrap">
                      no timed stops yet
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {confirmCluster &&
          (() => {
            const keeperId = keeperFor(confirmCluster);
            const keeper = confirmCluster.find((f) => f.facility_id === keeperId)!;
            const merges = confirmCluster.filter((f) => f.facility_id !== keeperId);
            const totalLoads = merges.reduce((n, f) => n + loadCount(f), 0);
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div
                  className="absolute inset-0 bg-black/60"
                  onClick={() => setConfirmCluster(null)}
                />
                <div className="relative bg-canvas border border-hairline rounded-[12px] p-5 max-w-md mx-4">
                  <h3 className="font-display text-[22px] tracking-[.04em]">MERGE FACILITIES?</h3>
                  <p className="font-condensed text-[14px] text-dim mt-2">Everything moves onto:</p>
                  <p className="font-condensed text-[15px] mt-1">
                    <b>{facilityLabel(keeper)}</b>{" "}
                    <span className="text-faint">
                      · {keeper.city}, {keeper.state}
                    </span>
                  </p>
                  <p className="font-condensed text-[14px] text-dim mt-3">
                    <b className="text-ink">
                      {totalLoads} load{totalLoads === 1 ? "" : "s"}
                    </b>{" "}
                    reassigned from {merges.length}{" "}
                    {merges.length === 1 ? "facility" : "facilities"}, then deleted:
                  </p>
                  <div className="font-condensed text-[14px] mt-2 flex flex-col gap-1">
                    {merges.map((f) => (
                      <span key={f.facility_id}>
                        • {facilityLabel(f)}{" "}
                        <span className="text-faint">({loadCount(f)} loads)</span>
                      </span>
                    ))}
                  </div>
                  <p className="font-condensed text-[12px] text-[#e05252] mt-3">
                    ⚠ This can't be undone.
                  </p>
                  {mergeErr && (
                    <p className="text-destructive text-xs mt-2">{mergeErr}</p>
                  )}
                  <div className="flex gap-2 justify-end mt-4">
                    <button
                      onClick={() => setConfirmCluster(null)}
                      className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-dim bg-well border border-hairline"
                    >
                      CANCEL
                    </button>
                    <button
                      onClick={runMerge}
                      disabled={merging}
                      className="h-9 px-4 rounded-[9px] font-condensed font-semibold text-[13.5px] text-canvas disabled:opacity-50"
                      style={{
                        background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
                      }}
                    >
                      {merging ? "MERGING…" : "MERGE"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
      </div>
    </div>
  );
};

export default FacilitiesPage;
