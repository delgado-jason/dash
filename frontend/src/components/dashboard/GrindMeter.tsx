import { Flame } from "lucide-react";
import type { Load } from "@/types/load";
import { useGrind } from "@/hooks/useGrind";
import type { WeekStatus } from "@/lib/metrics/grind";
import { Stamp } from "@/components/Stamp";

const CELL: Record<WeekStatus, string> = {
  target: "#4ade80",
  breakeven: "#e8940a",
  below: "#f87171",
  home: "#2a3347",
};

const thisWeekLine = (
  s: WeekStatus,
): { text: string; color: string } => {
  switch (s) {
    case "target":
      return { text: "You've beaten your weekly target — nice run.", color: "#4ade80" };
    case "breakeven":
      return { text: "Covering the floor — a bit more freight beats target.", color: "#e8940a" };
    case "below":
      return { text: "Below your weekly floor so far.", color: "#f87171" };
    default:
      return { text: "No freight booked this week yet.", color: "#9daabb" };
  }
};

const Dot = ({ color, label }: { color: string; label: string }) => (
  <span className="text-[11px] text-muted-text">
    <span
      className="inline-block w-2.5 h-2.5 rounded-[3px] align-middle mr-1.5"
      style={{ background: color }}
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
    <div
      className="relative overflow-hidden rounded-2xl border-2 p-4 mb-6"
      style={{ background: "#10151f", borderColor: "#e8940a" }}
    >
      <div
        className="absolute top-0 right-0 w-28 h-28 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(#e8940a 1.3px, transparent 1.4px)",
          backgroundSize: "7px 7px",
          opacity: 0.12,
        }}
      />

      <div className="relative flex items-center gap-2 mb-3">
        <span className="font-comic text-xl" style={{ color: "#f5b03a" }}>
          THE GRIND
        </span>
        <span className="flex-1" />
        {currentStreak >= 5 && <Stamp label="On fire!" color="#f87171" size="sm" />}
      </div>

      <div className="relative flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Flame size={50} style={{ color: cold ? "#9daabb" : "#e8940a" }} />
          <div className="leading-none">
            {cold ? (
              <>
                <span className="font-comic text-3xl" style={{ color: "#9daabb" }}>
                  COLD
                </span>
                <div className="text-xs text-muted-text mt-1.5">
                  beat target this week to light it
                </div>
              </>
            ) : (
              <>
                <span className="font-comic text-4xl" style={{ color: "#f5b03a" }}>
                  {currentStreak}
                </span>
                <span className="font-comic text-lg ml-1">
                  {currentStreak === 1 ? "WEEK" : "WEEKS"}
                </span>
                <div className="text-xs text-muted-text mt-1">
                  on a target-beating streak
                </div>
              </>
            )}
          </div>
        </div>
        <span className="flex-1" />
        <div className="text-right">
          <div className="text-[11px] tracking-wide text-muted-text">PERSONAL BEST</div>
          <div className="font-comic text-2xl" style={{ color: "#c9b58f" }}>
            {bestStreak} {bestStreak === 1 ? "WK" : "WKS"}
          </div>
        </div>
      </div>

      <div className="relative mt-4">
        <div className="flex gap-1 flex-wrap">
          {weeks.map((w) => (
            <span
              key={w.start}
              className="w-5 h-5 rounded-[5px] shrink-0"
              style={{ background: CELL[w.status] }}
              title={w.start}
            />
          ))}
          <span
            className="w-5 h-5 rounded-[5px] shrink-0"
            style={{ border: "2px dashed #e8940a" }}
            title="this week"
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-text mt-1.5">
          <span>← {weeks.length} weeks</span>
          <span>this week</span>
        </div>
      </div>

      <div className="relative flex gap-x-4 gap-y-1 flex-wrap mt-3">
        <Dot color="#4ade80" label="Beat target" />
        <Dot color="#e8940a" label="Covered break-even" />
        <Dot color="#f87171" label="Below" />
        <Dot color="#2a3347" label="Home" />
      </div>

      <div className="relative mt-3.5 border-t border-plate pt-2.5 text-[13px]">
        <span style={{ color: status.color, fontWeight: 600 }}>This week — </span>
        <span className="text-muted-text">{status.text}</span>
      </div>
    </div>
  );
};
