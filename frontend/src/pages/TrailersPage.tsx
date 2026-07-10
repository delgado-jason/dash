import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { Trailer } from "@/types/trailer";
import { getTrailers, createTrailer } from "@/services/trailersService";
import { AvatarFallback } from "@/components/fleet/AvatarFallback";
import { EntityForm, type FormField } from "@/components/fleet/EntityForm";
import { MilestoneBurst } from "@/components/fleet/MilestoneBurst";
import { mileMilestone } from "@/lib/metrics/mileClub";

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
    label: "Hubodometer",
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

const TrailersPage = () => {
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    getTrailers()
      .then(setTrailers)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

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

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-condensed">Trailers</h1>
        {!showForm && (
          <button
            className="bg-amber text-steel px-3 py-1 rounded text-sm font-semibold flex items-center gap-1"
            onClick={() => setShowForm(true)}
          >
            <Plus size={15} /> Add trailer
          </button>
        )}
      </div>

      {showForm && (
        <EntityForm
          title="New trailer"
          fields={FIELDS}
          onSave={save}
          onCancel={() => setShowForm(false)}
          busy={busy}
          error={error}
        />
      )}

      {loading ? (
        <p className="text-muted-text">Loading…</p>
      ) : trailers.length === 0 ? (
        <p className="text-muted-text">
          No trailers yet. Add one to get started.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trailers.map((t) => {
            const m = mileMilestone(t.current_hub);
            return (
              <Link
                key={t.trailer_id}
                to={`/trailers/${t.trailer_id}`}
                className="relative overflow-hidden bg-plate rounded-lg p-4 flex gap-3 items-center hover:bg-steel transition-colors"
              >
                {m.crossed != null && (
                  <div className="absolute -top-2 -right-2 rotate-[-8deg]">
                    <MilestoneBurst tier={m.tier!} label={m.label!} size={44} />
                  </div>
                )}
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-steel shrink-0">
                  {t.avatar_url ? (
                    <img
                      src={t.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <AvatarFallback kind="trailer" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">Unit {t.unit_number}</p>
                  <p className="text-xs text-muted-text truncate capitalize">
                    {t.trailer_type}
                    {t.length_ft ? ` · ${t.length_ft}'` : ""}
                  </p>
                  <p className="text-xs text-muted-text">
                    {t.current_hub.toLocaleString("en-US")} mi · {t.status}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TrailersPage;
