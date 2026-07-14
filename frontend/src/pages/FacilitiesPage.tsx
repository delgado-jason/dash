import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useFacilities } from "@/hooks/useFacilities";
import { createFacility } from "@/services/facilitiesService";
import { EntityForm, type FormField } from "@/components/fleet/EntityForm";
import type { FacilityRow } from "@/types/facility";

const FIELDS: FormField[] = [
  { name: "name", label: "Name", required: true, placeholder: "Nucor Steel" },
  { name: "city", label: "City", required: true, placeholder: "Decatur" },
  { name: "state", label: "State", required: true, placeholder: "AL" },
  { name: "address", label: "Address", placeholder: "1810 Steelmill Rd (optional)" },
];

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
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (data: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await createFacility(data);
      setShowForm(false);
      setRefreshKey((p) => p + 1);
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not create the facility",
      );
    } finally {
      setBusy(false);
    }
  };

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
        <div className="mb-4">
          <EntityForm
            title="New facility"
            fields={FIELDS}
            onSave={save}
            onCancel={() => setShowForm(false)}
            busy={busy}
            error={error}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-text">Loading…</p>
      ) : facilities.length === 0 ? (
        <p className="text-muted-text">
          No facilities yet. They're created as you add loads, or add one here.
        </p>
      ) : (
        <div className="bg-plate rounded-lg p-4 overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 460 }}>
            <thead>
              <tr className="text-muted-text text-left text-xs">
                <th className="font-normal pb-2">Facility</th>
                <th className="font-normal pb-2">Location</th>
                <th className="font-normal pb-2 text-right">Loads</th>
                <th className="font-normal pb-2">Role</th>
              </tr>
            </thead>
            <tbody>
              {facilities.map((f) => (
                <tr key={f.facility_id} className="border-t border-steel">
                  <td className="py-2">
                    <Link
                      to={`/facilities/${f.facility_id}`}
                      className="text-amber-light hover:underline font-medium"
                    >
                      {f.name}
                    </Link>
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
