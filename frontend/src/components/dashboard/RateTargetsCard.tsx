import type { useRateTargets } from "@/hooks/useRateTargets";
import { RateLadder } from "./RateLadder";

type Targets = ReturnType<typeof useRateTargets>;

const RED = "#e24b4a";
const AMBER = "#e8940a";
const GREEN = "#1d9e75";
const TRACK = "#232c3f";

const money = (n: number | null): string =>
  n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;

// This week's gross vs floor (break-even) + target. The solid bar is EARNED
// (delivered) freight — what actually counts; the faded extension is COMMITTED
// (booked/in-transit) pipeline still to haul. Color grades off earned.
const PaceBar = ({
  earned,
  committed,
  floor,
  target,
}: {
  earned: number;
  committed: number;
  floor: number;
  target: number;
}) => {
  const frac = (v: number) =>
    target > 0 ? Math.max(0, Math.min(1, v / target)) : 0;
  const floorPos = target > 0 ? Math.min(1, floor / target) : 0;
  const color = earned >= target ? GREEN : earned >= floor ? AMBER : RED;
  return (
    <div className="relative h-2 rounded mt-2 mb-1" style={{ background: TRACK }}>
      <div
        className="absolute left-0 top-0 h-2 rounded"
        style={{ width: `${frac(committed) * 100}%`, background: color, opacity: 0.3 }}
      />
      <div
        className="absolute left-0 top-0 h-2 rounded"
        style={{ width: `${frac(earned) * 100}%`, background: color }}
      />
      <div
        className="absolute top-0 h-2"
        style={{ left: `${floorPos * 100}%`, width: 2, background: "#ebedf5" }}
        title="break-even floor"
      />
    </div>
  );
};

const BURST =
  "57,30 47.39,34.66 53.38,43.5 42.73,42.73 43.5,53.38 34.66,47.39 30,57 " +
  "25.34,47.39 16.5,53.38 17.27,42.73 6.62,43.5 12.61,34.66 3,30 12.61,25.34 " +
  "6.62,16.5 17.27,17.27 16.5,6.62 25.34,12.61 30,3 34.66,12.61 43.5,6.62 " +
  "42.73,17.27 53.38,16.5 47.39,25.34";

// Pops when this week's booked gross clears the weekly target — a genuine win.
const TargetBurst = () => (
  <span
    style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}
    aria-hidden="true"
  >
    <svg
      viewBox="0 0 60 60"
      width={52}
      height={52}
      style={{ transform: "rotate(-8deg)" }}
    >
      <polygon points={BURST} fill={GREEN} stroke="#0d1117" strokeWidth={1.5} />
      <text
        x={30}
        y={34}
        textAnchor="middle"
        className="font-condensed"
        fontWeight={600}
        fontSize={11}
        fill="#04241a"
      >
        TARGET!
      </text>
    </svg>
  </span>
);

export const RateTargetsCard = ({
  targets,
  rpm,
}: {
  targets: Targets;
  rpm?: number | null; // "your rate" marker; defaults to the recent-window rate
}) => {
  const { ladder, gross, weekBooked, weekEarned, basis, ready } = targets;
  const markerRpm = rpm !== undefined ? rpm : basis.windowRpm;
  const committedAhead = Math.max(0, weekBooked - weekEarned);
  const beatTarget =
    gross.weeklyTarget != null &&
    gross.weeklyTarget > 0 &&
    weekEarned >= gross.weeklyTarget;

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
            <p className="text-xs text-muted-text mb-3">
              Rate per loaded mile · marker = this week
            </p>
            <RateLadder ladder={ladder} rpm={markerRpm} />
          </div>

          <div>
            <p className="text-xs text-muted-text">This week · earned</p>
            <div className="flex items-center gap-2">
              <p className="text-xl font-condensed mt-1">{money(weekEarned)}</p>
              {beatTarget && <TargetBurst />}
            </div>
            <PaceBar
              earned={weekEarned}
              committed={weekBooked}
              floor={gross.weeklyBreakEven ?? 0}
              target={gross.weeklyTarget ?? 0}
            />
            <p className="text-xs text-muted-text">
              floor {money(gross.weeklyBreakEven)} · target{" "}
              {money(gross.weeklyTarget)}
            </p>
            {committedAhead > 0 && (
              <p className="text-xs mt-1 text-muted-text">
                + {money(committedAhead)} committed, still to haul
              </p>
            )}
            {beatTarget && (
              <p className="text-xs mt-1" style={{ color: GREEN }}>
                Beat target by {money(weekEarned - (gross.weeklyTarget ?? 0))}
              </p>
            )}
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
