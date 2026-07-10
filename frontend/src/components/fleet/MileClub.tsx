import { mileMilestone, fmtMiles } from "@/lib/metrics/mileClub";
import { MilestoneBurst, MILE_TIER_COLOR } from "./MilestoneBurst";

// The character-sheet banner: current mileage, earned club, and progress to the
// next one. `unit` is "mi" for a truck/driver, "hub" for a trailer.
export const MileClub = ({
  miles,
  unit = "mi",
}: {
  miles: number;
  unit?: string;
}) => {
  const m = mileMilestone(miles);
  const toNext = `${Math.round(m.toNext / 1000)}K to the ${fmtMiles(m.next)} club`;
  const track = "#232c3f";

  if (m.crossed == null) {
    return (
      <div className="mt-4">
        <div className="flex justify-between items-baseline text-xs text-muted-text mb-1">
          <span className="font-condensed text-lg text-light">
            {miles.toLocaleString("en-US")} {unit}
          </span>
          <span>{toNext}</span>
        </div>
        <div className="h-2 rounded" style={{ background: track }}>
          <div
            className="h-2 rounded"
            style={{ width: `${m.pct * 100}%`, background: MILE_TIER_COLOR.bronze }}
          />
        </div>
      </div>
    );
  }

  const color = MILE_TIER_COLOR[m.tier!];
  return (
    <div className="flex items-center gap-3 mt-4">
      <div className="shrink-0">
        <MilestoneBurst tier={m.tier!} label={m.label!} size={52} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-condensed text-lg" style={{ color }}>
          {m.title}
        </p>
        <div className="flex justify-between items-baseline text-xs text-muted-text mb-1">
          <span>
            {miles.toLocaleString("en-US")} {unit}
          </span>
          <span>{toNext}</span>
        </div>
        <div className="h-2 rounded" style={{ background: track }}>
          <div
            className="h-2 rounded"
            style={{ width: `${m.pct * 100}%`, background: color }}
          />
        </div>
      </div>
    </div>
  );
};
