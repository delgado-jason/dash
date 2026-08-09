import type { CSSProperties } from "react";
import type { Load } from "@/types/load";
import { useGrind } from "@/hooks/useGrind";
import type { WeekStatus } from "@/lib/metrics/grind";
import { Board } from "@/components/ui/Board";

// Design System v2 / The Forge — the grind streak as HEAT. Target weeks keep
// the metal hot; the streak is consecutive weeks at temperature. Same engine
// (useGrind — frozen), new body: the comic flame/Bangers treatment retired.
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

const thisWeekLine = (s: WeekStatus): { text: string; color: string } => {
  switch (s) {
    case "target":
      return { text: "You've beaten your weekly target — nice run.", color: "var(--color-status-positive-text)" };
    case "breakeven":
      return { text: "Covering the floor — a bit more freight beats target.", color: "var(--color-amber)" };
    case "below":
      return { text: "Below your weekly floor so far.", color: "var(--color-status-negative-text)" };
    default:
      return { text: "Nothing delivered yet this week.", color: "var(--color-dim)" };
  }
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

export const GrindMeter = ({ loads }: { loads: Load[] }) => {
  const grind = useGrind(loads);
  if (!grind || !grind.hasLadder || grind.weeks.length === 0) return null;

  const { currentStreak, bestStreak, weeks, thisWeek } = grind;
  const cold = currentStreak === 0;
  const status = thisWeekLine(thisWeek);

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
              <div className="text-xs text-dim mt-1.5">
                beat target this week to light it
              </div>
            </>
          ) : (
            <>
              <span className="font-forge font-bold text-[36px] text-amber-hi">
                ×{currentStreak}
              </span>
              <span className="font-forge font-semibold text-[15px] ml-1.5 text-dim">
                {currentStreak === 1 ? "WEEK" : "WEEKS"}
              </span>
              <div className="text-xs text-dim mt-1">on a target-beating streak</div>
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
        <Dot style={CELL.target.style} label="Beat target" />
        <Dot style={CELL.breakeven.style} label="Covered break-even" />
        <Dot style={CELL.below.style} label="Below" />
        <Dot style={{ background: "var(--color-well)" }} label="Home" />
      </div>

      <div className="mt-3.5 border-t ds2-cell-rule pt-2.5 text-[13px]">
        <span style={{ color: status.color, fontWeight: 600 }}>This week — </span>
        <span className="text-dim">{status.text}</span>
      </div>
    </Board>
  );
};
