import type { useRateTargets } from "@/hooks/useRateTargets";
import { RateLadder } from "./RateLadder";

type Targets = ReturnType<typeof useRateTargets>;

const RED = "#e24b4a";
const AMBER = "#e8940a";
const GREEN = "#1d9e75";
const TRACK = "#232c3f";

const money = (n: number | null): string =>
  n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;

// This week's booked gross against its floor (break-even) and target ticks.
const PaceBar = ({
  booked,
  floor,
  target,
}: {
  booked: number;
  floor: number;
  target: number;
}) => {
  const fill = target > 0 ? Math.max(0, Math.min(1, booked / target)) : 0;
  const floorPos = target > 0 ? Math.min(1, floor / target) : 0;
  const color = booked >= target ? GREEN : booked >= floor ? AMBER : RED;
  return (
    <div className="relative h-2 rounded mt-2 mb-1" style={{ background: TRACK }}>
      <div
        className="absolute left-0 top-0 h-2 rounded"
        style={{ width: `${fill * 100}%`, background: color }}
      />
      <div
        className="absolute top-0 h-2"
        style={{ left: `${floorPos * 100}%`, width: 2, background: "#ebedf5" }}
        title="break-even floor"
      />
    </div>
  );
};

export const RateTargetsCard = ({
  targets,
  rpm,
}: {
  targets: Targets;
  rpm?: number | null; // "your rate" marker; defaults to the recent-window rate
}) => {
  const { ladder, gross, weekBooked, basis, ready } = targets;
  const markerRpm = rpm !== undefined ? rpm : basis.windowRpm;

  return (
    <div className="bg-plate rounded-lg p-4">
      <div className="flex justify-between items-baseline mb-3">
        <p className="text-sm font-medium text-light">Rate &amp; pace targets</p>
        <p className="text-xs text-muted-text">
          {ready
            ? `live · last ${basis.months} complete month${basis.months > 1 ? "s" : ""}`
            : "needs P&L history"}
        </p>
      </div>

      {!ready ? (
        <p className="text-sm text-muted-text py-4">
          Upload a few months of P&amp;L on the Expenses page to unlock your live
          rate targets.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1fr] gap-6">
          <div>
            <p className="text-xs text-muted-text mb-3">Rate per loaded mile</p>
            <RateLadder ladder={ladder} rpm={markerRpm} />
          </div>

          <div>
            <p className="text-xs text-muted-text">This week · booked</p>
            <p className="text-xl font-condensed mt-1">{money(weekBooked)}</p>
            <PaceBar
              booked={weekBooked}
              floor={gross.weeklyBreakEven ?? 0}
              target={gross.weeklyTarget ?? 0}
            />
            <p className="text-xs text-muted-text">
              floor {money(gross.weeklyBreakEven)} · target{" "}
              {money(gross.weeklyTarget)}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-text">Daily rate target</p>
            <p className="text-xl font-condensed mt-1" style={{ color: GREEN }}>
              {money(gross.dailyTarget)}
            </p>
            <p className="text-xs text-muted-text mt-1">
              break-even {money(gross.dailyBreakEven)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
