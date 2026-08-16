import type { CSSProperties } from "react";
import type { Load } from "@/types/load";
import { useGrind } from "@/hooks/useGrind";
import type { Grind, WeekStatus } from "@/lib/metrics/grind";
import { Board } from "@/components/ui/Board";

// Design System v2 / The Forge — the grind streak as HEAT. Target weeks keep
// the metal hot; the streak is consecutive weeks at temperature. Two modes: the
// owner's cost target, and a dispatcher's personal pace (her own typical week).
type Mode = "owner" | "personal";

const CELL: Record<WeekStatus, { cls: string; style?: CSSProperties }> = {
  target: {
    cls: "",
    style: {
      background: "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
      boxShadow: "0 0 8px rgba(232,148,10,.55)",
    },
  },
  breakeven: { cls: "", style: { background: "#5a4218" } },
  below: { cls: "", style: { background: "rgba(248,113,113,.4)" } },
  home: { cls: "bg-well", style: { boxShadow: "inset 0 1px 3px rgba(0,0,0,.6)" } },
};

// Copy differs by mode: the owner grades against a cost target; the dispatcher
// against her own usual week.
const COPY: Record<Mode, {
  streak: string;
  coldHint: string;
  legendTarget: string;
  legendMid: string;
  legendBelow: string;
  thisWeek: Record<WeekStatus, { text: string; color: string }>;
}> = {
  owner: {
    streak: "on a target-beating streak",
    coldHint: "beat target this week to light it",
    legendTarget: "Beat target",
    legendMid: "Covered break-even",
    legendBelow: "Below",
    thisWeek: {
      target: { text: "You've beaten your weekly target — nice run.", color: "var(--color-status-positive-text)" },
      breakeven: { text: "Covering the floor — a bit more freight beats target.", color: "var(--color-amber)" },
      below: { text: "Below your weekly floor so far.", color: "var(--color-status-negative-text)" },
      home: { text: "Nothing delivered yet this week.", color: "var(--color-dim)" },
    },
  },
  personal: {
    streak: "on a booking streak",
    coldHint: "book your usual week to light it",
    legendTarget: "Hit your pace",
    legendMid: "Light week",
    legendBelow: "Slow",
    thisWeek: {
      target: { text: "You beat your usual week — nice run.", color: "var(--color-status-positive-text)" },
      breakeven: { text: "A lighter week — a bit more matches your usual pace.", color: "var(--color-amber)" },
      below: { text: "Slow start this week.", color: "var(--color-status-negative-text)" },
      home: { text: "Nothing delivered yet this week.", color: "var(--color-dim)" },
    },
  },
};

const Dot = ({ style, label }: { style?: CSSProperties; label: string }) => (
  <span className="text-[11px] text-dim">
    <span
      className="inline-block w-2.5 h-2.5 rounded-[3px] align-middle mr-1.5"
      style={style}
    />
    {label}
  </span>
);

// Presentational — takes a pre-computed grind so a dispatcher's personal-pace
// grind can flow through without the owner's P&L fetch.
export const GrindMeterView = ({ grind, mode = "owner" }: { grind: Grind | null; mode?: Mode }) => {
  if (!grind || !grind.hasLadder || grind.weeks.length === 0) return null;

  const c = COPY[mode];
  const { currentStreak, bestStreak, weeks, thisWeek } = grind;
  const cold = currentStreak === 0;
  const status = c.thisWeek[thisWeek];

  return (
    <Board className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="font-forge font-bold text-[17px] tracking-[.12em] text-dim">
          HEAT
        </span>
        <span className="flex-1" />
        {currentStreak >= 5 && (
          <span className="font-forge font-semibold text-[13px] tracking-[.12em] text-amber-hi">
            RUNNING HOT
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="leading-none">
          {cold ? (
            <>
              <span className="font-forge font-bold text-[30px] text-faint">COLD</span>
              <div className="text-xs text-dim mt-1.5">{c.coldHint}</div>
            </>
          ) : (
            <>
              <span className="font-forge font-bold text-[36px] text-amber-hi">
                ×{currentStreak}
              </span>
              <span className="font-forge font-semibold text-[15px] ml-1.5 text-dim">
                {currentStreak === 1 ? "WEEK" : "WEEKS"}
              </span>
              <div className="text-xs text-dim mt-1">{c.streak}</div>
            </>
          )}
        </div>
        <span className="flex-1" />
        <div className="text-right">
          <div className="ds2-label">Personal best</div>
          <div className="font-forge font-semibold text-[20px] text-dim mt-0.5">
            ×{bestStreak} {bestStreak === 1 ? "WK" : "WKS"}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex gap-1 flex-wrap">
          {weeks.map((w) => (
            <span
              key={w.start}
              className={`w-5 h-5 rounded-[5px] shrink-0 ${CELL[w.status].cls}`}
              style={CELL[w.status].style}
              title={w.start}
            />
          ))}
          <span
            className="w-5 h-5 rounded-[5px] shrink-0 border-2 border-dashed border-amber"
            title="this week"
          />
        </div>
        <div className="flex justify-between text-[10px] text-faint mt-1.5">
          <span>← {weeks.length} weeks</span>
          <span>this week</span>
        </div>
      </div>

      <div className="flex gap-x-4 gap-y-1 flex-wrap mt-3">
        <Dot style={CELL.target.style} label={c.legendTarget} />
        <Dot style={CELL.breakeven.style} label={c.legendMid} />
        <Dot style={CELL.below.style} label={c.legendBelow} />
        <Dot style={{ background: "var(--color-well)" }} label="Home" />
      </div>

      <div className="mt-3.5 border-t ds2-cell-rule pt-2.5 text-[13px]">
        <span style={{ color: status.color, fontWeight: 600 }}>This week — </span>
        <span className="text-dim">{status.text}</span>
      </div>
    </Board>
  );
};

// The owner's grind — fetches the P&L target via useGrind, then renders the view.
export const GrindMeter = ({ loads }: { loads: Load[] }) => {
  const grind = useGrind(loads);
  return <GrindMeterView grind={grind} mode="owner" />;
};
