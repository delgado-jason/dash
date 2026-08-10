import type { Grade, SeasonStats, Lever } from "@/lib/metrics/playerCard";
import type { QuarterPace } from "@/lib/metrics/quarterPace";
import { bottleneckLevers, allLeversOnTarget } from "@/lib/metrics/playerCard";
import { QuarterPaceCard } from "./QuarterPaceCard";
import { DEADHEAD_TARGET } from "@/lib/constants/targets";
import { money } from "@/lib/format";

// The season machinery the mockup's card didn't carry but the business does:
// the three profit levers with the bottleneck coach, the full quarter-pace
// read, and the last-season grid. Lives directly under the hardware board.

const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;
const pct0 = (n: number) => `${Math.round(n * 100)}%`;

const GREEN = "#4ade80";
const RED = "#f87171";
const AMBER = "#e8940a";

const profitColor = (n: number) => (n < 0 ? RED : GREEN);
const deadheadColor = (pct: number | null): string | undefined => {
  if (pct == null) return undefined;
  if (pct <= DEADHEAD_TARGET) return GREEN;
  if (pct <= DEADHEAD_TARGET * 1.5) return AMBER;
  return RED;
};

const GRADE_META: Record<Grade, { label: string; fg: string; bg: string }> = {
  below: { label: "BELOW", fg: "#f87171", bg: "#3a1a1a" },
  minimum: { label: "MINIMUM", fg: "#e8940a", bg: "#3a2a0a" },
  target: { label: "TARGET", fg: "#4ade80", bg: "#1a3a2a" },
  strong: { label: "STRONG", fg: "#fbbf24", bg: "#3a300a" },
};

const gradeColor = (g: Grade | null): string | undefined =>
  g ? GRADE_META[g].fg : undefined;

// A short, plain-language nudge for whichever lever is the bottleneck.
const LEVER_HINTS: Record<string, string> = {
  rate: "you're booking below target — hold out for better-paying freight.",
  util: "the truck sitting is what's capping the season — keep it rolling.",
  margin: "costs are eating the margin — watch deadhead and fuel.",
};

const LeverTile = ({
  label,
  value,
  grade,
}: {
  label: string;
  value: string;
  grade: Grade | null;
}) => {
  const m = grade ? GRADE_META[grade] : null;
  return (
    <div
      className="rounded-[10px] px-3 py-2.5"
      style={{
        background: "var(--color-well)",
        border: `1px solid ${m ? m.bg : "var(--color-hairline-lo)"}`,
      }}
    >
      <p className="font-condensed text-[10px] tracking-[.12em] text-faint uppercase">{label}</p>
      <p className="text-lg font-condensed font-semibold my-0.5 truncate tabular-nums">{value}</p>
      {m ? (
        <span
          className="font-condensed text-[10px] font-bold px-2 py-0.5 rounded-full tracking-[.08em]"
          style={{ background: m.bg, color: m.fg }}
        >
          {m.label}
        </span>
      ) : (
        <span className="text-[10px] text-faint">—</span>
      )}
    </div>
  );
};

const Stat = ({
  label,
  value,
  color,
  span2,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  span2?: boolean;
  sub?: string;
}) => (
  <div
    className={`rounded-[10px] px-3 py-2 ${span2 ? "col-span-2" : ""}`}
    style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline-lo)" }}
  >
    <p className="font-condensed text-[11px] tracking-[.1em] uppercase text-faint">{label}</p>
    <p
      className="text-lg font-condensed font-semibold truncate tabular-nums"
      style={color ? { color } : undefined}
    >
      {value}
    </p>
    {sub && <p className="font-condensed text-[10px] text-faint truncate">{sub}</p>}
  </div>
);

export interface LeversBoardProps {
  season: SeasonStats;
  rpmGrade: Grade | null;
  marginGrade: Grade | null;
  utilization: number | null;
  utilGrade: Grade | null;
  windowRpm: number | null;
  pace: QuarterPace | null;
}

export const LeversBoard = ({
  season,
  rpmGrade,
  marginGrade,
  utilization,
  utilGrade,
  windowRpm,
  pace,
}: LeversBoardProps) => {
  const levers: Lever[] = [
    { key: "rate", label: "Rate", grade: rpmGrade },
    { key: "util", label: "Utilization", grade: utilGrade },
    { key: "margin", label: "Op margin", grade: marginGrade },
  ];
  const bottleneck = bottleneckLevers(levers);
  const onTarget = allLeversOnTarget(levers);
  const rateVal = windowRpm != null ? `$${windowRpm.toFixed(2)}/mi` : "—";
  const utilVal = utilization != null ? pct0(utilization) : "—";
  const marginVal = season.netMargin != null ? pct1(season.netMargin) : "—";

  return (
    <div className="ds2-board p-4 mt-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
          The levers — season · {season.label}
        </span>
        <span className="font-condensed text-[11px] text-faint">your three profit levers</span>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mt-3">
        <LeverTile label="Rate" value={rateVal} grade={rpmGrade} />
        <LeverTile label="Utilization" value={utilVal} grade={utilGrade} />
        <LeverTile label="Op margin" value={marginVal} grade={marginGrade} />
      </div>

      {bottleneck.length > 0 ? (
        <div
          className="mt-3 px-3.5 py-2.5 rounded-[10px]"
          style={{ background: "rgba(232,148,10,.08)", border: "1px solid rgba(232,148,10,.4)" }}
        >
          <p
            className="font-condensed text-[13px] font-bold tracking-[.1em] uppercase"
            style={{ color: "var(--color-amber-hi)" }}
          >
            Bottleneck · {bottleneck.map((l) => l.label).join(" & ")}
          </p>
          <p className="font-condensed text-[11px]" style={{ color: "var(--color-dim)" }}>
            {bottleneck.length === 1
              ? LEVER_HINTS[bottleneck[0].key]
              : "two levers are lagging — tackle the weakest first."}
          </p>
        </div>
      ) : onTarget ? (
        <div
          className="mt-3 px-3.5 py-2.5 rounded-[10px]"
          style={{ background: "#12261a", border: "1px solid #1f6e4a" }}
        >
          <p
            className="font-condensed text-[13px] font-bold tracking-[.1em] uppercase"
            style={{ color: GREEN }}
          >
            Firing on all cylinders
          </p>
        </div>
      ) : (
        <p className="font-condensed text-[11px] text-faint mt-3">
          Grades build over a full month of data.
        </p>
      )}

      {pace && <QuarterPaceCard pace={pace} />}

      <div className="flex items-baseline gap-2 mt-5 mb-2">
        <span className="font-forge font-bold text-lg" style={{ color: "var(--color-amber-hi)" }}>
          LAST SEASON
        </span>
        <span className="font-condensed text-[11px] text-faint">
          · {season.label} · the last complete quarter
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Net revenue" value={money(season.netRevenue)} sub="net of carrier cut" />
        <Stat
          label="Operating profit"
          value={money(season.netProfit)}
          color={profitColor(season.netProfit)}
          sub="before obligations"
        />
        <Stat
          label="True net"
          value={money(season.trueNet)}
          color={profitColor(season.trueNet)}
          sub="what you keep, before draw"
        />
        <Stat label="Loads" value={String(season.loads)} />
        <Stat label="Miles" value={Math.round(season.totalMiles).toLocaleString("en-US")} />
        <Stat
          label="Deadhead"
          value={season.deadheadPct != null ? pct1(season.deadheadPct) : "—"}
          color={deadheadColor(season.deadheadPct)}
        />
        <Stat
          label="Avg RPM"
          value={season.avgRpm != null ? `$${season.avgRpm.toFixed(2)}` : "—"}
          color={gradeColor(rpmGrade)}
        />
        <Stat label="Best lane" value={season.bestLane?.lane ?? "—"} span2 />
      </div>
    </div>
  );
};
