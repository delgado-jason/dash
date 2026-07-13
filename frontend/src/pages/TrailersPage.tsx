import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { Trailer } from "@/types/trailer";
import type { MaintenanceService } from "@/types/maintenance";
import { getTrailers, createTrailer } from "@/services/trailersService";
import { getMaintenanceServices } from "@/services/maintenanceService";
import { useLoads } from "@/hooks/useLoads";
import { trailerFleetSummary } from "@/lib/metrics/trailerMetrics";
import { AvatarFallback } from "@/components/fleet/AvatarFallback";
import { EntityForm, type FormField } from "@/components/fleet/EntityForm";
import { MilestoneBurst } from "@/components/fleet/MilestoneBurst";
import { mileMilestone } from "@/lib/metrics/mileClub";

const num = (n: number) => Math.round(n).toLocaleString("en-US");

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
  const { loads } = useLoads(0);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [services, setServices] = useState<MaintenanceService[]>([]);
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
    getMaintenanceServices().then(setServices).catch(() => {});
  }, []);

  // Fleet comparison only earns its keep with more than one trailer.
  const fleet =
    trailers.length > 1 ? trailerFleetSummary(trailers, loads, services, new Date()) : [];
  const best = {
    util: Math.max(0, ...fleet.map((r) => r.utilization ?? 0)),
    epm: Math.max(0, ...fleet.map((r) => r.earningsPerMile ?? 0)),
    mi: Math.max(0, ...fleet.map((r) => r.milesPerMonth ?? 0)),
    earn: Math.max(0, ...fleet.map((r) => r.earnings)),
  };

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

      {fleet.length > 1 && (
        <div className="bg-plate rounded-lg p-4 mb-4 overflow-x-auto">
          <p className="text-xs text-muted-text mb-2">
            Fleet comparison{" "}
            <span className="text-[11px]">· best per column highlighted</span>
          </p>
          <table className="w-full text-sm" style={{ minWidth: 380 }}>
            <thead>
              <tr className="text-muted-text text-right">
                <th className="text-left font-normal pb-2">Trailer</th>
                <th className="font-normal pb-2">Util</th>
                <th className="font-normal pb-2">Earn/mi</th>
                <th className="font-normal pb-2">Mi/mo</th>
                <th className="font-normal pb-2">Earnings</th>
              </tr>
            </thead>
            <tbody>
              {fleet.map((r) => (
                <tr key={r.trailerId} className="border-t border-steel text-right">
                  <td className="text-left py-1.5">Unit {r.unit}</td>
                  <td style={r.utilization != null && r.utilization === best.util ? { color: "#4ade80" } : undefined}>
                    {r.utilization != null ? `${Math.round(r.utilization * 100)}%` : "—"}
                  </td>
                  <td style={r.earningsPerMile != null && r.earningsPerMile === best.epm ? { color: "#4ade80" } : undefined}>
                    {r.earningsPerMile != null ? `$${r.earningsPerMile.toFixed(2)}` : "—"}
                  </td>
                  <td style={r.milesPerMonth != null && r.milesPerMonth === best.mi ? { color: "#4ade80" } : undefined}>
                    {r.milesPerMonth != null ? num(r.milesPerMonth) : "—"}
                  </td>
                  <td style={r.earnings === best.earn && r.earnings > 0 ? { color: "#4ade80" } : undefined}>
                    {`$${num(r.earnings)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
