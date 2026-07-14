import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useFacilities } from "@/hooks/useFacilities";
import { FacilityCreateForm } from "@/components/FacilityCreateForm";
import { Panel } from "@/components/ui/Panel";
import { facilityLabel, possibleDuplicates } from "@/lib/facilityMatch";
import { mergeFacilities } from "@/services/facilitiesService";
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

const KindTag = ({ kind }: { kind: string }) => (
  <span
    className="text-[9px] px-1.5 py-0.5 rounded-full align-middle"
    style={
      kind === "job_site"
        ? { background: "#1e2740", color: "#9db2d8" }
        : { background: "#12251a", color: "#6fd08c" }
    }
  >
    {kind === "job_site" ? "job site" : "business"}
  </span>
);

const FacilitiesPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const { facilities, isLoading } = useFacilities(refreshKey);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [keeperSel, setKeeperSel] = useState<Record<string, string>>({});
  const [confirmCluster, setConfirmCluster] = useState<FacilityRow[] | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeErr, setMergeErr] = useState<string | null>(null);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return facilities;
    return facilities.filter((f) =>
      `${f.name ?? ""} ${f.address ?? ""} ${f.city} ${f.state}`
        .toLowerCase()
        .includes(q),
    );
  }, [facilities, search]);

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-condensed">Facilities</h1>
        {!showForm && (
          <button
            className="bg-amber text-steel px-3 py-1 rounded text-sm font-semibold flex items-center gap-1"
            onClick={() => setShowForm(true)}
          >
            <Plus size={15} /> Add facility
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-4 max-w-md">
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

      {dupes.length > 0 && (
        <div className="mb-4 flex flex-col gap-3">
          <p className="text-xs text-muted-text uppercase tracking-wider">
            Possible duplicates
          </p>
          {dupes.map((cluster) => {
            const keeperId = keeperFor(cluster);
            return (
              <Panel
                key={clusterKey(cluster)}
                className="p-4 border max-w-lg"
                style={{ borderColor: "#3a2a12" }}
              >
                <div className="flex justify-between items-center mb-1">
                  <span
                    className="font-condensed text-base"
                    style={{ color: "#f5c37a" }}
                  >
                    Possible duplicate · {cluster[0].city}, {cluster[0].state}{" "}
                    <KindTag kind={cluster[0].kind} />
                  </span>
                  <span className="text-[11px] text-muted-text">
                    pick the one to keep
                  </span>
                </div>
                {cluster.map((f) => (
                  <label
                    key={f.facility_id}
                    className="flex items-center gap-2 py-1.5 border-t border-iron cursor-pointer text-sm"
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
                      style={{ accentColor: "#e8940a" }}
                    />
                    <span className="flex-1">{facilityLabel(f)}</span>
                    <span className="text-muted-text text-xs">
                      {loadCount(f)} loads
                    </span>
                    {keeperId === f.facility_id && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full"
                        style={{ background: "#2a1e0e", color: "#f5c37a" }}
                      >
                        keeper
                      </span>
                    )}
                  </label>
                ))}
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => setConfirmCluster(cluster)}
                    className="bg-amber text-steel text-xs px-3 py-1.5 rounded font-semibold"
                  >
                    Merge {cluster.length - 1} into keeper →
                  </button>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {facilities.length > 0 && (
        <input
          className="bg-steel rounded px-3 py-1.5 text-sm text-light placeholder:text-muted-text w-full max-w-xs mb-4"
          placeholder="Search name, address, city"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {isLoading ? (
        <p className="text-muted-text">Loading…</p>
      ) : facilities.length === 0 ? (
        <p className="text-muted-text">
          No facilities yet. They're created as you add loads, or add one here.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-text">No facilities match "{search}".</p>
      ) : (
        <Panel className="p-4 overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 480 }}>
            <thead>
              <tr className="text-muted-text text-left text-xs">
                <th className="font-normal pb-2">Facility</th>
                <th className="font-normal pb-2">Location</th>
                <th className="font-normal pb-2 text-right">Loads</th>
                <th className="font-normal pb-2">Role</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.facility_id} className="border-t border-steel">
                  <td className="py-2">
                    <Link
                      to={`/facilities/${f.facility_id}`}
                      className="text-amber-light hover:underline font-medium"
                    >
                      {facilityLabel(f)}
                    </Link>{" "}
                    <KindTag kind={f.kind} />
                  </td>
                  <td className="py-2 text-muted-text whitespace-nowrap">
                    {f.city}, {f.state}
                  </td>
                  <td className="py-2 text-right">{f.as_shipper + f.as_receiver}</td>
                  <td className="py-2 text-muted-text">{roleLabel(f)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
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
                className="absolute inset-0 bg-black/50"
                onClick={() => setConfirmCluster(null)}
              />
              <div className="relative bg-iron border border-steel rounded-xl p-5 max-w-md mx-4">
                <h3 className="font-condensed text-xl mb-2">Merge facilities?</h3>
                <p className="text-sm text-muted-text">Everything moves onto:</p>
                <p className="text-sm mb-3">
                  <b>{facilityLabel(keeper)}</b>{" "}
                  <span className="text-muted-text">
                    · {keeper.city}, {keeper.state}
                  </span>
                </p>
                <p className="text-sm text-muted-text">
                  <b className="text-light">
                    {totalLoads} load{totalLoads === 1 ? "" : "s"}
                  </b>{" "}
                  reassigned from {merges.length}{" "}
                  {merges.length === 1 ? "facility" : "facilities"}, then deleted:
                </p>
                <div className="text-sm mt-2 flex flex-col gap-1">
                  {merges.map((f) => (
                    <span key={f.facility_id}>
                      • {facilityLabel(f)}{" "}
                      <span className="text-muted-text">
                        ({loadCount(f)} loads)
                      </span>
                    </span>
                  ))}
                </div>
                <p className="text-[11px] mt-3" style={{ color: "#f2a6a3" }}>
                  ⚠ This can't be undone.
                </p>
                {mergeErr && (
                  <p className="text-destructive text-xs mt-2">{mergeErr}</p>
                )}
                <div className="flex gap-2 justify-end mt-4">
                  <button
                    onClick={() => setConfirmCluster(null)}
                    className="bg-steel text-light text-sm px-3 py-1.5 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={runMerge}
                    disabled={merging}
                    className="bg-amber text-steel text-sm px-3 py-1.5 rounded font-semibold disabled:opacity-50"
                  >
                    {merging ? "Merging…" : "Merge"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
};

export default FacilitiesPage;
