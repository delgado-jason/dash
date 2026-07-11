import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Trophy, Sparkles } from "lucide-react";
import type { Trophy as TrophyRecord } from "@/types/trophy";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { FuelEntry } from "@/types/fuelEntry";
import { useLoads } from "@/hooks/useLoads";
import { getTrophies } from "@/services/trophyService";
import { getDrivers } from "@/services/driversService";
import { getTrucks } from "@/services/trucksService";
import { getFuelEntries } from "@/services/fuelService";
import { loadRevenue } from "@/lib/metrics/rateTargets";
import { maxFuelOdometer } from "@/lib/metrics/fuelEconomy";
import { TROPHY_CATALOG } from "@/lib/trophies/catalog";
import { computeAllStatuses, type TrophyStatus } from "@/lib/trophies/status";

const fmtDate = (d: string) =>
  new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

// A framed avatar portrait hung on the hall wall.
const Portrait = ({ url, name }: { url: string | null; name: string }) => (
  <div className="w-[104px]">
    <div
      className="aspect-square rounded overflow-hidden"
      style={{ border: "4px double #e8940a", background: "#0d1119" }}
    >
      {url ? (
        <img src={url} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[#3b4660]">
          <Trophy size={28} />
        </div>
      )}
    </div>
    <div
      className="text-center font-comic text-[11px] mt-0.5"
      style={{ color: "#f5e6c8", letterSpacing: "1px" }}
    >
      {name}
    </div>
  </div>
);

const Pedestal = ({
  name,
  art,
  status,
  earnedOn,
}: {
  name: string;
  art: string | null;
  status: TrophyStatus;
  earnedOn: string | null;
}) => {
  const earned = status.earned;
  return (
    <div className="text-center">
      <div
        className="relative rounded-xl overflow-hidden border-2 aspect-square"
        style={{ background: "#0d1119", borderColor: earned ? "#e8940a" : "#232c3f" }}
      >
        {earned && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(circle at 50% 38%, rgba(232,148,10,0.22), transparent 70%)" }}
          />
        )}
        {art ? (
          <img
            src={art}
            alt={name}
            className="w-full h-full object-cover"
            style={earned ? undefined : { filter: "grayscale(1)", opacity: 0.4 }}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ color: earned ? "#f5b03a" : "#3b4660" }}
          >
            <Trophy size={40} />
          </div>
        )}
        {!earned && (
          <span className="absolute top-2 right-2 text-muted-text">
            <Lock size={15} />
          </span>
        )}
      </div>
      <div
        className="font-comic text-sm mt-1.5 leading-tight"
        style={{ color: earned ? "#f5e6c8" : "#9daabb" }}
      >
        {name}
      </div>
      {earned ? (
        <div className="text-[11px] text-status-positive-text">
          ★ {earnedOn ? fmtDate(earnedOn) : "Earned"}
        </div>
      ) : status.progress != null ? (
        <>
          <div className="h-1.5 rounded bg-plate overflow-hidden mt-1">
            <div className="h-full" style={{ width: `${status.progress * 100}%`, background: "#e8940a" }} />
          </div>
          <div className="text-[10px] text-muted-text mt-0.5">{status.progressLabel}</div>
        </>
      ) : (
        <div className="text-[10px] text-muted-text">Locked</div>
      )}
    </div>
  );
};

const TrophyHallPage = () => {
  const { loads } = useLoads(0);
  const [records, setRecords] = useState<TrophyRecord[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [fuel, setFuel] = useState<FuelEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getTrophies(), getDrivers(), getTrucks(), getFuelEntries()])
      .then(([tr, dr, tk, fu]) => {
        setRecords(tr);
        setDrivers(dr);
        setTrucks(tk);
        setFuel(fu);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const byKey = useMemo(() => {
    const m: Record<string, TrophyRecord> = {};
    for (const t of records) m[t.trophy_key] = t;
    return m;
  }, [records]);

  const statuses = useMemo(() => {
    const lifetimeMiles = Math.max(
      0,
      ...trucks.map((t) => Number(t.current_odometer) || 0),
      maxFuelOdometer(fuel) ?? 0,
      ...loads.map((l) => Number(l.odometer_end) || 0),
    );
    const cumulativeGross = loads
      .filter((l) => l.load_status === "delivered")
      .reduce((s, l) => s + loadRevenue(l), 0);
    return computeAllStatuses(TROPHY_CATALOG, byKey, {
      lifetimeMiles,
      driverCount: drivers.filter((d) => d.active).length,
      truckCount: trucks.length,
      cumulativeGross,
    });
  }, [byKey, drivers, trucks, fuel, loads]);

  const hallBg = byKey["hall-background"]?.image_url ?? null;
  const driverAvatar = drivers.find((d) => d.avatar_url)?.avatar_url ?? null;
  const truck = trucks.find((t) => t.avatar_url) ?? trucks[0];
  const earnedCount = TROPHY_CATALOG.filter((d) => statuses[d.key]?.earned).length;

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-3xl font-condensed">Trophy Room</h1>
        <Link
          to="/trophy-studio"
          className="text-sm text-status-info-text hover:underline flex items-center gap-1"
        >
          <Sparkles size={14} /> Studio
        </Link>
      </div>

      {loading ? (
        <p className="text-muted-text">Loading…</p>
      ) : (
        <>
          {/* ---- hall hero ---- */}
          <div
            className="relative rounded-2xl overflow-hidden border-2 mb-6"
            style={{ borderColor: "#e8940a", background: "#0d1119", minHeight: 260 }}
          >
            {hallBg && (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${hallBg})` }}
              />
            )}
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to bottom, rgba(10,13,19,0.35), rgba(10,13,19,0.75))" }}
            />
            <div className="relative flex items-center justify-between gap-3 p-5 min-h-[260px]">
              <Portrait url={driverAvatar} name={drivers[0] ? drivers[0].first_name : "Driver"} />
              <div className="text-center">
                <div className="font-comic text-[13px] tracking-[3px]" style={{ color: "#9daabb" }}>
                  DELGADO TRUCKING
                </div>
                <div className="font-comic text-4xl sm:text-5xl leading-none" style={{ color: "#f5b03a" }}>
                  HALL OF FAME
                </div>
                <div className="text-xs text-muted-text mt-2">
                  {earnedCount} of {TROPHY_CATALOG.length} trophies earned
                </div>
                {!hallBg && (
                  <Link to="/trophy-studio" className="text-xs text-status-info-text hover:underline mt-2 inline-block">
                    Generate your hall in the Studio →
                  </Link>
                )}
              </div>
              <Portrait url={truck?.avatar_url ?? null} name={truck ? `Unit ${truck.unit_number}` : "Truck"} />
            </div>
          </div>

          {/* ---- the collection ---- */}
          <div className="font-comic text-lg mb-3" style={{ color: "#f5b03a" }}>
            THE COLLECTION
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {TROPHY_CATALOG.map((def) => (
              <Pedestal
                key={def.key}
                name={def.name}
                art={byKey[def.key]?.image_url ?? null}
                status={statuses[def.key]}
                earnedOn={byKey[def.key]?.earned_on ?? null}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default TrophyHallPage;
