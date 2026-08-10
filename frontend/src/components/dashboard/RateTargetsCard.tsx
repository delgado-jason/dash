import type { useRateTargets } from "@/hooks/useRateTargets";
import { BandedLadder } from "@/components/ui/BandedLadder";
import { Panel } from "@/components/ui/Panel";
import { money } from "@/lib/format";

type Targets = ReturnType<typeof useRateTargets>;

const RED = "#e24b4a";
const AMBER = "#e8940a";
const GREEN = "#1d9e75";
const GREEN_TICK = "#35c47a"; // brighter than the fill, so the target tick reads on top of it
const TRACK = "#232c3f";

// This week's gross vs floor (break-even) and target (your margin goal). The bar
// spans past target for headroom; solid fill is EARNED (delivered), the faded
// extension is COMMITTED (booked/in-transit) still to haul. Color grades off
// earned vs the floor/target thresholds. The weekly target is a total-REVENUE
// goal (margin goal) — the per-mile rate tiers don't belong on this bar.
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
  // Headroom past target so it sits inside the bar as a milestone, not flush
  // at the right edge.
  const max = target > 0 ? target * 1.15 : 1;
  const frac = (v: number) => (max > 0 ? Math.max(0, Math.min(1, v / max)) : 0);
  const color = earned >= target ? GREEN : earned >= floor ? AMBER : RED;
  // Floor is a quiet reference tick; target (green) is the goal — taller, glowing.
  const tick = (v: number, c: string, goal: boolean, title: string) => (
    <div
      className="absolute"
      title={title}
      style={{
        left: `${frac(v) * 100}%`,
        transform: "translateX(-50%)",
        width: goal ? 3 : 2,
        top: goal ? -3 : 0,
        height: goal ? 14 : 8,
        borderRadius: goal ? 2 : 0,
        background: c,
        boxShadow: goal ? `0 0 4px ${c}` : undefined,
        opacity: goal ? 1 : 0.75,
      }}
    />
  );
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
      {tick(floor, AMBER, false, "break-even floor")}
      {tick(target, GREEN_TICK, true, "target")}
    </div>
  );
};

// Color-coded key so each tick's threshold is unmistakable.
const LegendItem = ({
  color,
  label,
  value,
  emphasize,
}: {
  color: string;
  label: string;
  value: string;
  emphasize?: boolean;
}) => (
  <span className="inline-flex items-center gap-1">
    <span
      className="inline-block rounded-sm shrink-0"
      style={{ width: 9, height: 9, background: color }}
    />
    <span style={emphasize ? { color: "#c8d0dc", fontWeight: 600 } : undefined}>
      {label} {value}
    </span>
  </span>
);

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

export const RateTargetsCard = ({ targets }: { targets: Targets }) => {
  const {
    bookingLadder,
    specLadder,
    grossRate,
    gross,
    weekBooked,
    weekEarned,
    basis,
    ready,
    linehaulTake,
  } = targets;
  const committedAhead = Math.max(0, weekBooked - weekEarned);
  const beatTarget =
    gross.weeklyTarget != null &&
    gross.weeklyTarget > 0 &&
    weekEarned >= gross.weeklyTarget;

  return (
    <Panel noir className="p-4">
      <div className="flex justify-between items-baseline mb-3">
        <p className="text-sm font-medium text-light">Rate &amp; pace targets</p>
        <p className="text-xs text-muted-text">
          {ready
            ? `live · gross $ · last ${basis.months} complete month${basis.months > 1 ? "s" : ""}`
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
              Rate to book · gross $/mile driven · marker = your rate
            </p>
            <BandedLadder ladder={bookingLadder} rpm={grossRate} label="Standard flatbed" />
            <BandedLadder ladder={specLadder} rpm={grossRate} label="Oversize / specialized" />
            <p className="text-[11px] text-muted-text mt-2">
              walk-away = your cost/mile ÷ your{" "}
              {Math.round(linehaulTake * 100)}% keep. Book above it — with your
              deadhead in the miles — and you clear cost.
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-text">This week · earned (gross)</p>
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
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-muted-text">
              <LegendItem color={AMBER} label="floor" value={money(gross.weeklyBreakEven)} />
              <LegendItem
                color={GREEN_TICK}
                label="target"
                value={money(gross.weeklyTarget)}
                emphasize
              />
            </div>
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
    </Panel>
  );
};
