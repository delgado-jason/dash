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
  avgMilesPerMonth,
  maxOdometer,
} from "@/lib/metrics/maintenance";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";
import { EntityForm } from "@/components/fleet/EntityForm";
import { MileClub } from "@/components/fleet/MileClub";
import { TRAILER_FIELDS, toFormValues } from "@/lib/fleetFields";
import { formatDate } from "@/lib/format";

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
  }, [id]);

  // Latest hub reading, derived from the app: stored + newest trailer service.
  const hub = useMemo(() => {
    if (!trailer) return 0;
    const svcHubs = services
      .filter((s) => s.unit === "trailer" || s.unit === "both")
      .map((s) => s.trailer_hub);
    return maxOdometer(trailer.current_hub, ...svcHubs) ?? trailer.current_hub;
  }, [trailer, services]);

  const mpm = useMemo(() => avgMilesPerMonth(loads, new Date()), [loads]);
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

      <Link
        to="/maintenance"
        className="bg-plate rounded-lg p-4 hover:bg-steel transition-colors block max-w-xs"
      >
        <p className="text-xs text-muted-text mb-2">Maintenance</p>
        <div className="flex gap-3 text-sm">
          <span style={{ color: "#e24b4a" }}>{due.overdue} overdue</span>
          <span style={{ color: "#e8940a" }}>{due.soon} due soon</span>
        </div>
      </Link>
    </div>
  );
};

export default TrailerDetailPage;
