import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Share2 } from "lucide-react";
import type { Truck } from "@/types/truck";
import type { Driver } from "@/types/driver";
import type { Trailer } from "@/types/trailer";
import type { FuelEntry } from "@/types/fuelEntry";
import type { Load } from "@/types/load";
import { useLoads } from "@/hooks/useLoads";
import { getTrucks } from "@/services/trucksService";
import { getDrivers } from "@/services/driversService";
import { getTrailers } from "@/services/trailersService";
import { getFuelEntries } from "@/services/fuelService";
import { careerRank } from "@/lib/metrics/playerCard";
import { loadTypeMix } from "@/lib/metrics/loadMix";
import { fuelStats } from "@/lib/metrics/fuelEconomy";
import { maxOdometer } from "@/lib/metrics/maintenance";
import { maxFuelOdometer } from "@/lib/metrics/fuelEconomy";
import { RigCard, type RigCardProps } from "@/components/celebrations/RigCard";

const kMi = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}K`);
const num = (n: number) => Math.round(n).toLocaleString("en-US");

const delivered = (loads: Load[]) => loads.filter((l) => l.load_status === "delivered");
const statesOf = (loads: Load[]) => {
  const s = new Set<string>();
  for (const l of loads) {
    if (l.origin_state) s.add(l.origin_state.toUpperCase());
    if (l.destination_state) s.add(l.destination_state.toUpperCase());
  }
  return s.size;
};

const GaragePage = () => {
  const { loads } = useLoads(0);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [fuel, setFuel] = useState<FuelEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    getTrucks().then(setTrucks).catch(() => {});
    getDrivers().then(setDrivers).catch(() => {});
    getTrailers().then(setTrailers).catch(() => {});
    getFuelEntries().then(setFuel).catch(() => {});
  }, []);

  // Lifetime rig miles — the truck's odometer plus any fresher load/fuel reading.
  const rigMiles = maxOdometer(
    ...trucks.map((t) => Number(t.current_odometer) || 0),
    maxFuelOdometer(fuel) ?? 0,
    ...loads.map((l) => Number(l.odometer_end) || 0),
  ) ?? 0;

  const cards: { id: string; filename: string; props: RigCardProps }[] = [];

  for (const d of drivers) {
    const dl = delivered(loads.filter((l) => l.driver_id === d.driver_id));
    const mix = loadTypeMix(dl, "oversize");
    const rank = careerRank(rigMiles);
    cards.push({
      id: `driver:${d.driver_id}`,
      filename: `${d.first_name}-${d.last_name}-card`,
      props: {
        kind: "driver",
        name: `${d.first_name} ${d.last_name}`,
        subtitle: "Owner-Operator · Flatbed BCO",
        rankName: rank.name,
        rankIndex: rank.index,
        avatarUrl: d.avatar_url ?? null,
        specialty: mix.specialist ? "Oversize Specialist" : null,
        stats: [
          { label: "LIFETIME MI", value: kMi(rigMiles) },
          { label: "LOADS", value: num(dl.length) },
          { label: "STATES", value: num(statesOf(dl)) },
          { label: "OVERSIZE", value: mix.pct != null ? `${Math.round(mix.pct * 100)}%` : "—" },
        ],
      },
    });
  }

  for (const t of trucks) {
    const tl = delivered(loads.filter((l) => l.truck_id === t.truck_id));
    const odo = maxOdometer(
      Number(t.current_odometer) || 0,
      maxFuelOdometer(fuel.filter((f) => f.truck_id === t.truck_id)) ?? 0,
      ...tl.map((l) => Number(l.odometer_end) || 0),
    ) ?? 0;
    const rank = careerRank(odo);
    const fs = fuelStats(fuel.filter((f) => f.truck_id === t.truck_id), new Date());
    cards.push({
      id: `truck:${t.truck_id}`,
      filename: `unit-${t.unit_number}-card`,
      props: {
        kind: "truck",
        name: `Unit ${t.unit_number}`,
        subtitle: [t.year, t.make, t.model].filter(Boolean).join(" ") || "Tractor",
        rankName: rank.name,
        rankIndex: rank.index,
        avatarUrl: t.avatar_url ?? null,
        stats: [
          { label: "ODOMETER", value: kMi(odo) },
          { label: "BEST TANK", value: fs.bestMpg != null ? `${fs.bestMpg.toFixed(1)}` : "—" },
          { label: "LOADS", value: num(tl.length) },
          { label: "STATES", value: num(statesOf(tl)) },
        ],
      },
    });
  }

  for (const tr of trailers) {
    const trl = delivered(loads.filter((l) => l.trailer_id === tr.trailer_id));
    const heaviest = Math.max(0, ...trl.map((l) => Number(l.weight) || 0));
    const hub = Math.max(Number(tr.current_hub) || 0, 0);
    const rank = careerRank(hub);
    cards.push({
      id: `trailer:${tr.trailer_id}`,
      filename: `trailer-${tr.unit_number}-card`,
      props: {
        kind: "trailer",
        name: `Trailer ${tr.unit_number}`,
        subtitle: `${tr.trailer_type ?? "Flatbed"}${tr.length_ft ? ` · ${tr.length_ft}'` : ""}`,
        rankName: rank.name,
        rankIndex: rank.index,
        avatarUrl: tr.avatar_url ?? null,
        stats: [
          { label: "HUB MILES", value: kMi(hub) },
          { label: "LOADS", value: num(trl.length) },
          { label: "HEAVIEST", value: heaviest > 0 ? `${kMi(heaviest)} lb` : "—" },
          { label: "TYPE", value: (tr.trailer_type ?? "Flat").slice(0, 8) },
        ],
      },
    });
  }

  const share = async (id: string, filename: string) => {
    const node = refs.current[id];
    if (!node) return;
    setBusy(id);
    try {
      const url = await toPng(node, { cacheBust: true, pixelRatio: 2 });
      const a = document.createElement("a");
      a.download = `${filename}.png`;
      a.href = url;
      a.click();
    } catch {
      /* avatar CORS or render hiccup — the card still shows on screen */
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <h1 className="text-3xl font-condensed">Your Garage</h1>
      <p className="text-muted-text text-sm mt-1 mb-6">
        Your rig as collectible cards. Rank sets the foil — earn miles, climb the metal.
      </p>

      {cards.length === 0 ? (
        <p className="text-muted-text text-sm">Add a truck, driver, or trailer to build your deck.</p>
      ) : (
        <div className="flex flex-wrap gap-6">
          {cards.map((c) => (
            <div key={c.id} className="flex flex-col items-center gap-2.5">
              <div ref={(el) => { refs.current[c.id] = el; }}>
                <RigCard {...c.props} />
              </div>
              <button
                onClick={() => share(c.id, c.filename)}
                disabled={busy === c.id}
                className="flex items-center gap-1.5 bg-steel text-light text-sm px-4 py-1.5 rounded-lg disabled:opacity-50"
              >
                <Share2 size={14} /> {busy === c.id ? "Saving…" : "Share card"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GaragePage;
