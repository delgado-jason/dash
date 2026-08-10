import type { CareerRank } from "@/lib/metrics/playerCard";
import type { QuarterPace } from "@/lib/metrics/quarterPace";
import type { MonthCoverage } from "@/lib/metrics/monthCoverage";
import { STRIP_MIN_COUNT, type TypeMix } from "@/lib/metrics/loadMix";
import { fmtMiles } from "@/lib/metrics/mileClub";
import { RANK_TIERS } from "@/lib/constants/playerCard";
import { money } from "@/lib/format";

// The forged player card — built to the approved mockup's structure
// (2026-08-10, after Jason caught the first pass restyling the old shape):
// stencil head, three-stat career strip, then the meter rows — notes streak,
// quarter pace with the target notch, mile club, load mix. The profit levers,
// bottleneck coach, and season grid live in LeversBoard below the hardware;
// identity (name/avatar/hometime) lives in the page header.

const MIX_COLORS = ["var(--color-amber-hi)", "#4f8cd6", "#c9a86a", "#8494ab", "#7ab0e8"];
const TARGET_AT = 0.78; // the pace notch — same anchor as the money tab's PaceMeter

const pct0 = (n: number) => `${Math.round(n * 100)}%`;

const Cells = ({
  fill, // 0..1 of the runway
  notch, // optional 0..1 position for a target notch
  count = 14,
}: {
  fill: number;
  notch?: number;
  count?: number;
}) => (
  <div className="relative flex gap-[3px]">
    {Array.from({ length: count }, (_, i) => {
      const cellPos = (i + 1) / count;
      const on = cellPos <= fill + 1e-6;
      const overdrive = notch != null && on && cellPos > notch + 1e-6;
      return (
        <i
          key={i}
          className="flex-1 h-[11px] rounded-[2.5px]"
          style={
            on
              ? overdrive
                ? {
                    background: "linear-gradient(180deg, #ffffff, var(--color-hot))",
                    border: "1px solid rgba(255,255,255,.5)",
                    boxShadow: "0 0 7px rgba(255,207,122,.45)",
                  }
                : {
                    background: "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                    border: "1px solid rgba(245,176,58,.55)",
                    boxShadow: "0 0 6px rgba(232,148,10,.3)",
                  }
              : {
                  background: "var(--color-well)",
                  border: "1px solid var(--color-hairline-lo)",
                  boxShadow: "inset 0 2px 3px rgba(0,0,0,.55)",
                }
          }
        />
      );
    })}
    {notch != null && (
      <span
        className="absolute -top-[4px] -bottom-[4px] w-[2px] bg-ink opacity-70"
        style={{ left: `${notch * 100}%` }}
        aria-hidden
      >
        <span className="absolute -top-[13px] -left-[18px] font-condensed text-[9px] tracking-[.1em] text-faint">
          TARGET
        </span>
      </span>
    )}
  </div>
);

const MeterRow = ({
  label,
  right,
  children,
  last = false,
}: {
  label: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  last?: boolean;
}) => (
  <div className={`px-[18px] py-[13px] ${last ? "" : "border-b"} ds2-cell-rule`}>
    <div className="flex justify-between items-baseline gap-3 mb-[8px]">
      <span className="font-condensed font-semibold text-[11.5px] tracking-[.14em] uppercase text-faint">
        {label}
      </span>
      {right && (
        <span className="font-condensed font-semibold text-[12.5px] text-dim tabular-nums text-right">
          {right}
        </span>
      )}
    </div>
    {children}
  </div>
);

const TypeStrip = ({ label, mix }: { label: string; mix: TypeMix }) => {
  const spec = mix.specialist;
  return (
    <span
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
      <span style={{ color: spec ? "var(--color-dim)" : "var(--color-faint)" }}>
        {mix.count} {mix.count === 1 ? "load" : "loads"}
        {mix.pct != null ? ` · ${pct0(mix.pct)}` : ""}
      </span>
    </span>
  );
};

export interface MixRow {
  label: string;
  count: number;
  pct: number; // 0..1 of delivered loads
}

export interface PlayerCardProps {
  rank: CareerRank;
  seasonLabel: string; // head chip, e.g. "Q3 2026"
  career: { hauls: number; miles: number; linehaul: number };
  coverage: MonthCoverage | null; // the month vs the expense threshold
  pace: QuarterPace | null;
  mix: MixRow[]; // full delivered-load mix, largest first
  oversize?: TypeMix;
  heavyHaul?: TypeMix;
}

export const PlayerCard = ({
  rank,
  seasonLabel,
  career,
  coverage,
  pace,
  mix,
  oversize,
  heavyHaul,
}: PlayerCardProps) => {
  const stars =
    "★".repeat(rank.index + 1) + "☆".repeat(RANK_TIERS.length - rank.index - 1);

  // Quarter pace on the card: current net racing last quarter's finish, the
  // notch pinned at 78% like every pace meter in the app. Overdrive past it.
  const paceReady =
    pace != null &&
    (pace.verdict === "beat" || pace.verdict === "behind" || pace.verdict === "even");
  const paceScale = paceReady ? pace.prevFinalNet / TARGET_AT : null;
  const paceFill =
    paceReady && paceScale ? Math.min(1, pace.currentNet / paceScale) : 0;
  const paceRight = paceReady
    ? pace.pacePct != null
      ? `${pace.pacePct >= 0 ? "▲ +" : "▼ −"}${Math.abs(Math.round(pace.pacePct * 100))}% vs ${pace.prevLabel}`
      : pace.label
    : null;

  return (
    <div
      className="relative overflow-hidden rounded-[14px] border"
      style={{
        background: "linear-gradient(180deg, #0e1420, #0b101a)",
        borderColor: "var(--color-hairline)",
        boxShadow: "0 14px 34px rgba(0,0,0,.45)",
      }}
    >
      {/* head */}
      <div
        className="flex items-center gap-[14px] px-[18px] py-[14px] border-b ds2-cell-rule"
        style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}
      >
        <div className="min-w-0">
          <div
            className="font-forge font-bold text-[22px] leading-none"
            style={{ letterSpacing: "1.5px" }}
          >
            {rank.name.toUpperCase()}
          </div>
          <div className="font-condensed text-[11px] text-faint tracking-[.1em] uppercase mt-[3px]">
            <span style={{ color: "var(--color-amber-hi)", letterSpacing: "1px" }}>{stars}</span>{" "}
            · the player card · forged
          </div>
        </div>
        <span className="ml-auto font-condensed font-bold text-[10.5px] tracking-[.12em] px-[8px] py-[3px] rounded-[4px] text-dim border border-hairline whitespace-nowrap">
          SEASON · {seasonLabel.toUpperCase()}
        </span>
      </div>

      {/* career strip */}
      <div className="grid grid-cols-3 border-b ds2-cell-rule">
        <div className="px-[18px] py-3 border-r ds2-cell-rule">
          <p className="font-condensed font-semibold text-[23px] tabular-nums">{career.hauls}</p>
          <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-[2px]">
            Hauls delivered
          </p>
        </div>
        <div className="px-[18px] py-3 border-r ds2-cell-rule">
          <p className="font-condensed font-semibold text-[23px] tabular-nums">
            {career.miles.toLocaleString("en-US")}
          </p>
          <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-[2px]">
            Miles hauled
          </p>
        </div>
        <div className="px-[18px] py-3">
          <p className="font-condensed font-semibold text-[23px] tabular-nums">
            {money(career.linehaul)}
          </p>
          <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-[2px]">
            Linehaul · all-time
          </p>
        </div>
      </div>

      {/* meter rows */}
      <MeterRow
        label={`Covering the month${coverage?.estimated ? " · est." : ""}`}
        right={
          coverage && coverage.threshold != null
            ? coverage.covered
              ? `▲ +${money(coverage.marginOver ?? 0)} margin`
              : `${money(coverage.short ?? 0)} short${
                  coverage.coverDay != null ? ` · covers ~day ${coverage.coverDay}` : ""
                }`
            : undefined
        }
      >
        {coverage && coverage.threshold != null ? (
          <>
            <Cells
              fill={Math.min(1, coverage.income / (coverage.threshold / TARGET_AT))}
              notch={TARGET_AT}
            />
            <p className="font-condensed text-[10.5px] text-faint mt-[6px]">
              expenses {money(coverage.opEx ?? 0)} + notes {money(coverage.notes)} — the
              month is covered at {money(coverage.threshold)}; past it is margin
              {coverage.covered ? " — you're there" : ""}.
            </p>
          </>
        ) : (
          <p className="font-condensed text-[12.5px] text-faint border border-dashed border-hairline rounded-[7px] px-3 py-[7px]">
            The threshold forges from your P&L — post a month of expenses and the
            meter arms.
          </p>
        )}
      </MeterRow>

      <MeterRow label="Quarter pace" right={paceRight ?? undefined}>
        {paceReady ? (
          <Cells fill={paceFill} notch={TARGET_AT} />
        ) : (
          <p className="font-condensed text-[12.5px] text-faint border border-dashed border-hairline rounded-[7px] px-3 py-[7px]">
            {pace?.verdict === "no-prior"
              ? "No prior quarter to race yet — finish this one and the meter arms."
              : "Pace switches on a couple weeks and a few loads into the quarter."}
          </p>
        )}
      </MeterRow>

      <MeterRow
        label={
          rank.next
            ? `Mile club — next plate at ${fmtMiles(rank.next.min)}`
            : "Mile club — topped out"
        }
        right={
          rank.next
            ? `${rank.miles.toLocaleString("en-US")} / ${rank.next.min.toLocaleString("en-US")}`
            : fmtMiles(rank.miles)
        }
      >
        <Cells fill={rank.pct} count={10} />
      </MeterRow>

      <MeterRow label={`Load mix — ${career.hauls} delivered`} last>
        <div className="flex flex-col gap-[6px]">
          {mix.map((m, i) => (
            <div key={m.label} className="flex items-center gap-[10px]">
              <span className="font-condensed text-[13px] text-dim w-[120px] shrink-0 capitalize">
                {m.label}
              </span>
              <span
                className="flex-1 h-[9px] rounded-[3px] overflow-hidden"
                style={{ background: "var(--color-well)", boxShadow: "inset 0 2px 3px rgba(0,0,0,.5)" }}
              >
                <i
                  className="block h-full"
                  style={{
                    width: `${Math.max(2, m.pct * 100)}%`,
                    background: MIX_COLORS[i % MIX_COLORS.length],
                  }}
                />
              </span>
              <span className="font-condensed font-semibold text-[13px] text-ink w-[70px] text-right tabular-nums">
                {m.count} · {pct0(m.pct)}
              </span>
            </div>
          ))}
        </div>
        {((oversize && oversize.count >= STRIP_MIN_COUNT) ||
          (heavyHaul && heavyHaul.count >= STRIP_MIN_COUNT)) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {oversize && oversize.count >= STRIP_MIN_COUNT && (
              <TypeStrip label="Oversize" mix={oversize} />
            )}
            {heavyHaul && heavyHaul.count >= STRIP_MIN_COUNT && (
              <TypeStrip label="Heavy haul" mix={heavyHaul} />
            )}
          </div>
        )}
      </MeterRow>
    </div>
  );
};
