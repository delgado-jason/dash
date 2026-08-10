import type { ReactNode } from "react";
import type { Grade, CareerRank, SeasonStats, Lever } from "@/lib/metrics/playerCard";
import type { QuarterPace } from "@/lib/metrics/quarterPace";
import { QuarterPaceCard } from "./QuarterPaceCard";
import { bottleneckLevers, allLeversOnTarget } from "@/lib/metrics/playerCard";
import { STRIP_MIN_COUNT, type TypeMix } from "@/lib/metrics/loadMix";
import type { Hometime } from "@/lib/metrics/hometime";
import type { Medal } from "@/lib/awards/medals";
import { fmtMiles } from "@/lib/metrics/mileClub";
import { RANK_TIERS } from "@/lib/constants/playerCard";
import { DEADHEAD_TARGET } from "@/lib/constants/targets";
import { MedalBadge } from "@/components/awards/MedalBadge";
import { money } from "@/lib/format";

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

const gradeColor = (g: Grade | null): string | undefined => (g ? GRADE_META[g].fg : undefined);

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
    <p className="text-lg font-condensed font-semibold truncate tabular-nums" style={color ? { color } : undefined}>
      {value}
    </p>
    {sub && <p className="font-condensed text-[10px] text-faint truncate">{sub}</p>}
  </div>
);

// An equipment-mix identity strip (oversize / heavy haul). Oversize and heavy
// haul are DIFFERENT disciplines, so each gets its own strip. The specialist
// styling only lights when the underlying mix says so.
const TypeStrip = ({ label, mix }: { label: string; mix: TypeMix }) => {
  const spec = mix.specialist;
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px]"
      style={
        spec
          ? { background: "rgba(232,148,10,.08)", border: "1px solid rgba(232,148,10,.4)" }
          : { background: "var(--color-well)", border: "1px solid var(--color-hairline)" }
      }
    >
      <span
        className="font-condensed font-semibold uppercase tracking-[.08em]"
        style={{ color: spec ? "var(--color-amber-hi)" : "var(--color-dim)" }}
      >
        {spec ? `${label} specialist` : label}
      </span>
      <span style={{ color: spec ? "#c7935a" : "#7d8ba3" }}>
        {mix.count} {mix.count === 1 ? "load" : "loads"}
        {mix.pct != null ? ` · ${pct0(mix.pct)}` : ""}
      </span>
    </div>
  );
};

const shortDate = (key: string): string =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

// Hometime status strip — reads the days since your last "home" mark and flags
// when you've been out past your threshold. Four states, calm by default.
const HometimeChip = ({ hometime }: { hometime: Hometime }) => {
  const { state, daysOut, toTarget, lastHome } = hometime;
  const S =
    state === "over"
      ? { bg: "#3a1a1a", border: "#a32d2d", fg: "#f87171", sub: "#c98a8a" }
      : state === "home"
        ? { bg: "#123020", border: "#1f6e4a", fg: "#4ade80", sub: "#8fb9a4" }
        : { bg: "var(--color-well)", border: "var(--color-hairline)", fg: "var(--color-ink)", sub: "var(--color-faint)" };

  const title =
    state === "none"
      ? "No hometime data yet"
      : state === "home"
        ? "Home"
        : `Out ${daysOut} ${daysOut === 1 ? "day" : "days"}`;

  const sub =
    state === "none"
      ? "Mark home days on the per-diem calendar"
      : state === "home"
        ? "you're home today"
        : state === "over"
          ? `past your ${hometime.threshold}-day target${lastHome ? ` · last home ${shortDate(lastHome)}` : ""}`
          : `${toTarget} to your ${hometime.threshold}-day target`;

  return (
    <div
      className="flex items-center gap-2.5 mt-4 px-3 py-2 rounded-lg"
      style={{ background: S.bg, border: `1px solid ${S.border}` }}
    >
      <div className="min-w-0">
        <p
          className="font-condensed text-sm font-bold uppercase tracking-[.1em]"
          style={{ color: S.fg }}
        >
          {title}
        </p>
        <p className="text-[10.5px]" style={{ color: S.sub }}>
          {sub}
        </p>
      </div>
    </div>
  );
};

// A short, plain-language nudge for whichever lever is the bottleneck.
const LEVER_HINTS: Record<string, string> = {
  rate: "you're booking below target — hold out for better-paying freight.",
  util: "the truck sitting is what's capping the season — keep it rolling.",
  margin: "costs are eating the margin — watch deadhead and fuel.",
};

// One profit lever: its value and grade. Border tints to the grade.
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
      style={{ background: "var(--color-well)", border: `1px solid ${m ? m.bg : "var(--color-hairline-lo)"}` }}
    >
      <p className="font-condensed text-[10px] tracking-[.12em] text-faint uppercase">{label}</p>
      <p className="text-lg font-condensed my-0.5 truncate">{value}</p>
      {m ? (
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
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

export interface PlayerCardProps {
  name: string;
  business: string;
  avatar: ReactNode;
  rank: CareerRank;
  season: SeasonStats;
  rpmGrade: Grade | null;
  marginGrade: Grade | null;
  utilization: number | null; // 0..1, days-based; the third profit lever
  utilGrade: Grade | null;
  windowRpm: number | null;
  medals: Medal[]; // earned tiers only — worn by the name
  oversize?: TypeMix; // oversize equipment mix; strip hidden when count is 0
  heavyHaul?: TypeMix; // heavy-haul mix — a distinct discipline from oversize
  hometime?: Hometime; // days-since-home status; strip hidden when not provided
  pace?: QuarterPace | null; // current-quarter-vs-previous pace; hidden when absent
  streak?: number | null; // consecutive weeks covering the notes; row hidden when absent
}

export const PlayerCard = ({
  name,
  business,
  avatar,
  rank,
  season,
  rpmGrade,
  marginGrade,
  utilization,
  utilGrade,
  windowRpm,
  medals,
  oversize,
  heavyHaul,
  hometime,
  pace,
  streak,
}: PlayerCardProps) => {
  const stars = "★".repeat(rank.index + 1) + "☆".repeat(RANK_TIERS.length - rank.index - 1);

  // The three profit levers and their bottleneck (weakest, if below/minimum).
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
    <div>
      <div
        className="relative overflow-hidden rounded-[14px] border p-4"
        style={{
          background: "linear-gradient(180deg, #0e1420, #0b101a)",
          borderColor: "var(--color-hairline)",
          boxShadow: "0 14px 34px rgba(0,0,0,.45)",
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-16 pointer-events-none"
          style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}
        />
        <div className="flex gap-4 items-start relative">
          <div className="shrink-0">{avatar}</div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-3 flex-wrap">
              <h1 className="font-display text-[30px] tracking-[.04em] leading-none">{name.toUpperCase()}</h1>
              {medals.length > 0 && (
                <div className="flex gap-1.5 flex-wrap justify-end">
                  {medals.map((m) => (
                    <MedalBadge key={m.key} medal={m} />
                  ))}
                </div>
              )}
            </div>
            <p className="font-condensed text-xs text-faint tracking-[.06em] mb-3 mt-1 uppercase">{business}</p>
            {((oversize && oversize.count >= STRIP_MIN_COUNT) ||
              (heavyHaul && heavyHaul.count >= STRIP_MIN_COUNT)) && (
              <div className="flex flex-wrap gap-2 mb-3">
                {oversize && oversize.count >= STRIP_MIN_COUNT && (
                  <TypeStrip label="Oversize" mix={oversize} />
                )}
                {heavyHaul && heavyHaul.count >= STRIP_MIN_COUNT && (
                  <TypeStrip label="Heavy haul" mix={heavyHaul} />
                )}
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-forge font-bold text-xl leading-none" style={{ color: "var(--color-ink)", letterSpacing: "1.5px" }}>
                  {rank.name.toUpperCase()}
                </div>
                <div className="font-condensed text-[10px] text-faint tracking-[.08em] mt-0.5 uppercase">
                  <span style={{ color: "var(--color-amber-hi)", letterSpacing: "1px" }}>{stars}</span> · Career rank — the mile club
                </div>
                <div className="flex gap-[3px] mt-1.5">
                  {Array.from({ length: 10 }, (_, i) => (
                    <i
                      key={i}
                      className="flex-1 h-[9px] rounded-[2px]"
                      style={
                        i < Math.round(rank.pct * 10)
                          ? {
                              background: "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                              boxShadow: "0 0 6px rgba(232,148,10,.3)",
                            }
                          : {
                              background: "var(--color-well)",
                              border: "1px solid var(--color-hairline-lo)",
                              boxShadow: "inset 0 2px 3px rgba(0,0,0,.5)",
                            }
                      }
                    />
                  ))}
                </div>
                {rank.next && (
                  <div className="font-condensed text-[10px] text-faint mt-1">
                    {fmtMiles(rank.toNext)} to {rank.next.name.toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {hometime && <HometimeChip hometime={hometime} />}

        <div className="mt-4 pt-3 border-t relative" style={{ borderColor: "var(--color-hairline-lo)" }}>
          <div className="flex items-baseline gap-2 mb-2.5">
            <span className="font-condensed font-semibold text-sm tracking-[.14em] text-faint uppercase">
              Season · {season.label}
            </span>
            <span className="font-condensed text-[11px] text-faint">your three profit levers</span>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <LeverTile label="Rate" value={rateVal} grade={rpmGrade} />
            <LeverTile label="Utilization" value={utilVal} grade={utilGrade} />
            <LeverTile label="Op margin" value={marginVal} grade={marginGrade} />
          </div>
          {streak != null && (
            <div className="mt-3">
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="font-condensed font-semibold text-[11px] tracking-[.12em] text-faint uppercase">
                  Covering the notes — week streak
                </span>
                <span className="font-condensed font-semibold text-[13px] tabular-nums">
                  {streak} week{streak === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex gap-[3px]">
                {Array.from({ length: 10 }, (_, i) => (
                  <i
                    key={i}
                    className="flex-1 h-[9px] rounded-[2px]"
                    style={
                      i < Math.min(streak, 10)
                        ? {
                            background: "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                            boxShadow: "0 0 6px rgba(232,148,10,.3)",
                          }
                        : {
                            background: "var(--color-well)",
                            border: "1px solid var(--color-hairline-lo)",
                            boxShadow: "inset 0 2px 3px rgba(0,0,0,.5)",
                          }
                    }
                  />
                ))}
              </div>
            </div>
          )}
          {bottleneck.length > 0 ? (
            <div
              className="flex items-center gap-3 mt-3 px-3.5 py-2.5 rounded-[10px]"
              style={{ background: "rgba(232,148,10,.08)", border: "1px solid rgba(232,148,10,.4)" }}
            >
              <div className="min-w-0">
                <p className="font-condensed text-[13px] font-bold tracking-[.1em] uppercase" style={{ color: "var(--color-amber-hi)" }}>
                  Bottleneck · {bottleneck.map((l) => l.label).join(" & ")}
                </p>
                <p className="font-condensed text-[11px]" style={{ color: "var(--color-dim)" }}>
                  {bottleneck.length === 1
                    ? LEVER_HINTS[bottleneck[0].key]
                    : "two levers are lagging — tackle the weakest first."}
                </p>
              </div>
            </div>
          ) : onTarget ? (
            <div
              className="flex items-center gap-3 mt-3 px-3.5 py-2.5 rounded-[10px]"
              style={{ background: "#12261a", border: "1px solid #1f6e4a" }}
            >
              <p className="font-condensed text-[13px] font-bold tracking-[.1em] uppercase" style={{ color: "#4ade80" }}>
                Firing on all cylinders
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-faint mt-3">
              Grades build over a full month of data.
            </p>
          )}
        </div>
      </div>

      {pace && <QuarterPaceCard pace={pace} />}

      <div className="flex items-baseline gap-2 mt-5 mb-2">
        <span className="font-forge font-bold text-lg" style={{ color: "#f5b03a" }}>
          LAST SEASON
        </span>
        <span className="text-[11px] text-faint">· {season.label} · the last complete quarter</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Net revenue" value={money(season.netRevenue)} sub="net of carrier cut" />
        <Stat label="Operating profit" value={money(season.netProfit)} color={profitColor(season.netProfit)} sub="before obligations" />
        <Stat label="True net" value={money(season.trueNet)} color={profitColor(season.trueNet)} sub="what you keep, before draw" />
        <Stat label="Loads" value={String(season.loads)} />
        <Stat label="Miles" value={Math.round(season.totalMiles).toLocaleString("en-US")} />
        <Stat label="Deadhead" value={season.deadheadPct != null ? pct1(season.deadheadPct) : "—"} color={deadheadColor(season.deadheadPct)} />
        <Stat label="Avg RPM" value={season.avgRpm != null ? `$${season.avgRpm.toFixed(2)}` : "—"} color={gradeColor(rpmGrade)} />
        <Stat label="Best lane" value={season.bestLane?.lane ?? "—"} span2 />
      </div>
    </div>
  );
};
