import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useFacilities } from "@/hooks/useFacilities";
import { FacilityCreateForm } from "@/components/FacilityCreateForm";
import { facilityLabel } from "@/lib/facilityMatch";
import type { FacilityRow } from "@/types/facility";

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
        <div className="bg-plate rounded-lg p-4 overflow-x-auto">
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
        </div>
      )}
    </div>
  );
};

export default FacilitiesPage;
