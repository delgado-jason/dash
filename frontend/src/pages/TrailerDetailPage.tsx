import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { Trailer } from "@/types/trailer";
import type { MaintenanceItem } from "@/types/maintenance";
import { getTrailer } from "@/services/trailersService";
import { getMaintenanceItems } from "@/services/maintenanceService";
import { useLoads } from "@/hooks/useLoads";
import { computeDue, avgMilesPerMonth } from "@/lib/metrics/maintenance";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";

const Spec = ({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) => (
  <div>
    <p className="text-xs text-muted-text">{label}</p>
    <p className="text-sm">{value === null || value === undefined || value === "" ? "—" : value}</p>
  </div>
);

const TrailerDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { loads } = useLoads(0);
  const [trailer, setTrailer] = useState<Trailer | null>(null);
  const [items, setItems] = useState<MaintenanceItem[]>([]);

  useEffect(() => {
    if (!id) return;
    getTrailer(id).then(setTrailer).catch(() => {});
    getMaintenanceItems().then(setItems).catch(() => {});
  }, [id]);

  const mpm = useMemo(() => avgMilesPerMonth(loads, new Date()), [loads]);
  const due = useMemo(() => {
    let overdue = 0;
    let soon = 0;
    if (trailer) {
      for (const it of items.filter((i) => i.trailer_id === id)) {
        const d = computeDue(it, trailer.current_hub, new Date(), mpm);
        if (d.level === "overdue") overdue++;
        else if (d.level === "soon") soon++;
      }
    }
    return { overdue, soon };
  }, [items, trailer, id, mpm]);

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
          <h1 className="text-3xl font-condensed">Unit {trailer.unit_number}</h1>
          <p className="text-muted-text text-sm mb-4 capitalize">
            {trailer.trailer_type}
            {trailer.length_ft ? ` · ${trailer.length_ft}'` : ""} · {trailer.status}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Spec label="Hubodometer" value={`${trailer.current_hub.toLocaleString("en-US")} mi`} />
            <Spec label="VIN" value={trailer.vin} />
            <Spec
              label="Plate"
              value={trailer.plate_number ? `${trailer.plate_number} ${trailer.plate_state || ""}` : null}
            />
            <Spec label="Make" value={[trailer.year, trailer.make, trailer.model].filter(Boolean).join(" ")} />
            <Spec label="In service" value={trailer.in_service_date} />
          </div>
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
