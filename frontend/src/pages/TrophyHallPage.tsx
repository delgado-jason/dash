import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock, Trophy, Sparkles } from "lucide-react";
import type { Trophy as TrophyRecord } from "@/types/trophy";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { FuelEntry } from "@/types/fuelEntry";
import type { Obligation } from "@/types/obligation";
import { useLoads } from "@/hooks/useLoads";
import { getTrophies } from "@/services/trophyService";
import { getDrivers } from "@/services/driversService";
import { getTrucks } from "@/services/trucksService";
import { getFuelEntries } from "@/services/fuelService";
import { getObligations } from "@/services/obligationsService";
import { loadRevenue } from "@/lib/metrics/rateTargets";
import { assetLoanStatus } from "@/lib/metrics/payoff";
import { maxFuelOdometer } from "@/lib/metrics/fuelEconomy";
import { TROPHY_CATALOG } from "@/lib/trophies/catalog";
import { computeAllStatuses, type TrophyStatus } from "@/lib/trophies/status";

const fmtDate = (d: string) =>
  new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

// A framed portrait hung on the hall wall — the page draws the gold frame so it's
// always aligned (the AI background is a frameless room). Links to the entity page.
const Portrait = ({
  url,
  name,
  to,
}: {
  url: string | null;
  name: string;
  to?: string;
}) => {
  const inner: ReactNode = (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative rounded-[5px] p-2.5"
        style={{
          background:
            "linear-gradient(135deg,#f6d98a,#b5700a 38%,#7a4e08 62%,#f6d98a)",
          boxShadow:
            "0 14px 30px rgba(0,0,0,.6),0 0 0 2px #4a3305,0 0 26px rgba(232,148,10,.22)",
        }}
      >
        <div
          className="w-[124px] h-[124px] rounded-[2px] overflow-hidden"
          style={{ background: "#0a0d13", border: "2px solid #3a2a08" }}
        >
          {url ? (
            <img src={url} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#3b4660]">
              <Trophy size={30} />
            </div>
          )}
        </div>
      </div>
      <div
        className="font-comic text-[13px] uppercase px-4 py-0.5 rounded-[3px]"
        style={{
          color: "#2a1d04",
          letterSpacing: "1px",
          background: "linear-gradient(180deg,#f6d98a,#b5700a)",
          boxShadow: "0 3px 8px rgba(0,0,0,.5),inset 0 0 0 1px rgba(0,0,0,.25)",
        }}
      >
        {name}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="shrink-0 transition-transform hover:-translate-y-0.5">
      {inner}
    </Link>
  ) : (
    <div className="shrink-0">{inner}</div>
  );
};

// One trophy standing on the hall floor: a spotlit medallion (earned = lit gold,
// locked = grayed with a lock + live progress) over its light pool.
const TrophyStand = ({
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
    <figure className="relative flex flex-col items-center text-center">
      <div className="relative w-full">
        {/* light pool on the floor */}
        <div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none rounded-[50%]"
          style={{
            bottom: -13,
            width: "78%",
            height: 30,
            background: earned
              ? "radial-gradient(ellipse at center,rgba(232,148,10,.20),transparent 70%)"
              : "radial-gradient(ellipse at center,rgba(120,140,170,.09),transparent 70%)",
          }}
        />
        <div
          className="relative rounded-full overflow-hidden"
          style={{
            aspectRatio: "1 / 1",
            background: "#0a0d13",
            border: earned ? "3px solid #e8940a" : "3px solid #2a3550",
            boxShadow: earned
              ? "0 0 0 4px rgba(232,148,10,.12),0 0 30px rgba(232,148,10,.35)"
              : "none",
          }}
        >
          {art ? (
            <img
              src={art}
              alt={name}
              className="w-full h-full object-cover"
              style={earned ? undefined : { filter: "grayscale(1)", opacity: 0.45 }}
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ color: earned ? "#f5b03a" : "#3b4660" }}
            >
              <Trophy size={40} />
            </div>
          )}
          {earned && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle at 50% 32%,rgba(232,148,10,.18),transparent 68%)",
              }}
            />
          )}
          {!earned && (
            <span
              className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: "rgba(10,13,19,.8)", color: "#8b98ad" }}
            >
              <Lock size={13} />
            </span>
          )}
        </div>
      </div>

      <figcaption
        className="font-comic text-[15px] mt-3.5 leading-tight"
        style={{ color: earned ? "#f5e6c8" : "#9daabb" }}
      >
        {name}
      </figcaption>
      {earned ? (
        <div className="text-[11.5px] mt-1" style={{ color: "#5fb87a" }}>
          ★ {earnedOn ? fmtDate(earnedOn) : "Earned"}
        </div>
      ) : status.progress != null ? (
        <>
          <div
            className="h-1.5 rounded overflow-hidden mt-2"
            style={{ width: 104, background: "#1a2338" }}
          >
            <div
              className="h-full"
              style={{
                width: `${status.progress * 100}%`,
                background: "linear-gradient(to right,#b5700a,#f5b03a)",
              }}
            />
          </div>
          <div className="text-[10.5px] text-muted-text mt-1">
            {status.progressLabel}
          </div>
        </>
      ) : (
        <div className="text-[11px] text-muted-text mt-1">Locked</div>
      )}
    </figure>
  );
};

const TrophyHallPage = () => {
  const { loads } = useLoads(0);
  const [records, setRecords] = useState<TrophyRecord[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [fuel, setFuel] = useState<FuelEntry[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getTrophies(),
      getDrivers(),
      getTrucks(),
      getFuelEntries(),
      getObligations(),
    ])
      .then(([tr, dr, tk, fu, ob]) => {
        setRecords(tr);
        setDrivers(dr);
        setTrucks(tk);
        setFuel(fu);
        setObligations(ob);
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
    const now = new Date();
    return computeAllStatuses(TROPHY_CATALOG, byKey, {
      lifetimeMiles,
      driverCount: drivers.filter((d) => d.active).length,
      truckCount: trucks.length,
      cumulativeGross,
      truckLoan: assetLoanStatus(obligations, "truck", now),
      trailerLoan: assetLoanStatus(obligations, "trailer", now),
    });
  }, [byKey, drivers, trucks, fuel, loads, obligations]);

  const hallBg = byKey["hall-background"]?.image_url ?? null;
  const driver = drivers.find((d) => d.avatar_url) ?? drivers[0];
  const truck = trucks.find((t) => t.avatar_url) ?? trucks[0];
  const earnedCount = TROPHY_CATALOG.filter((d) => statuses[d.key]?.earned).length;

  const roomStyle = hallBg
    ? {
        backgroundImage: `linear-gradient(to bottom, rgba(9,12,18,.5), rgba(9,12,18,.8)), url(${hallBg})`,
        backgroundSize: "cover, cover",
        backgroundPosition: "center, center",
        backgroundRepeat: "no-repeat, no-repeat",
        backgroundAttachment: "fixed, fixed",
      }
    : undefined;

  return (
    <div
      className={`relative min-h-screen text-light font-body ${hallBg ? "" : "bg-iron"}`}
      style={roomStyle}
    >
      <div className="max-w-[1120px] mx-auto px-5 pb-20">
        <div className="flex justify-end pt-4">
          <Link
            to="/trophy-studio"
            className="text-sm text-cream/80 hover:text-cream flex items-center gap-1.5"
            style={{ textShadow: "0 1px 4px rgba(0,0,0,.8)" }}
          >
            <Sparkles size={14} /> Studio
          </Link>
        </div>

        {loading ? (
          <p className="text-muted-text text-center py-24">Entering the hall…</p>
        ) : (
          <>
            {/* ---- marquee: portraits framed on the walls + title ---- */}
            <header className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] items-center gap-6 py-10 sm:py-14 min-h-[300px]">
              <div className="hidden sm:block order-1">
                <Portrait
                  url={driver?.avatar_url ?? null}
                  name={driver ? driver.first_name : "Driver"}
                  to={driver ? `/drivers/${driver.driver_id}` : undefined}
                />
              </div>

              <div className="text-center order-first sm:order-2">
                <div
                  className="font-comic text-[13px]"
                  style={{ color: "#9daabb", letterSpacing: "4px" }}
                >
                  DELGADO TRUCKING
                </div>
                <h1
                  className="font-comic leading-[0.86] my-2"
                  style={{
                    fontSize: "clamp(44px,7vw,84px)",
                    color: "#f5b03a",
                    textShadow:
                      "3px 4px 0 #0a0d13, 0 0 34px rgba(232,148,10,.5)",
                  }}
                >
                  HALL OF FAME
                </h1>
                <div
                  className="inline-flex items-center gap-2 text-[12.5px] uppercase rounded-full px-4 py-1.5"
                  style={{
                    letterSpacing: "1.5px",
                    color: "#f5e6c8",
                    background: "rgba(10,13,19,.55)",
                    border: "1px solid #22304a",
                  }}
                >
                  <span
                    className="w-[7px] h-[7px] rounded-full"
                    style={{ background: "#5fb87a", boxShadow: "0 0 9px #5fb87a" }}
                  />
                  <b style={{ color: "#f5b03a" }}>{earnedCount}</b> of{" "}
                  <b style={{ color: "#f5b03a" }}>{TROPHY_CATALOG.length}</b>{" "}
                  enshrined
                </div>
                {!hallBg && (
                  <div className="mt-3">
                    <Link
                      to="/trophy-studio"
                      className="text-xs text-status-info-text hover:underline"
                    >
                      Generate your hall background in the Studio →
                    </Link>
                  </div>
                )}
              </div>

              <div className="hidden sm:block order-3">
                <Portrait
                  url={truck?.avatar_url ?? null}
                  name={truck ? `Unit ${truck.unit_number}` : "Truck"}
                  to={truck ? `/trucks/${truck.truck_id}` : undefined}
                />
              </div>

              {/* mobile: portraits below the title, side by side */}
              <div className="flex sm:hidden justify-center gap-8 order-last">
                <Portrait
                  url={driver?.avatar_url ?? null}
                  name={driver ? driver.first_name : "Driver"}
                  to={driver ? `/drivers/${driver.driver_id}` : undefined}
                />
                <Portrait
                  url={truck?.avatar_url ?? null}
                  name={truck ? `Unit ${truck.unit_number}` : "Truck"}
                  to={truck ? `/trucks/${truck.truck_id}` : undefined}
                />
              </div>
            </header>

            {/* ---- the collection, standing on the floor ---- */}
            <div className="flex items-center gap-3.5 mt-2 mb-9">
              <span
                className="font-comic text-[19px] whitespace-nowrap"
                style={{ color: "#f5b03a" }}
              >
                THE COLLECTION
              </span>
              <span
                className="h-px flex-1"
                style={{
                  background:
                    "linear-gradient(to right,rgba(232,148,10,.5),transparent)",
                }}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-9">
              {TROPHY_CATALOG.map((def) => (
                <TrophyStand
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
    </div>
  );
};

export default TrophyHallPage;
