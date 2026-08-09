import { useMemo } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { careerRank } from "@/lib/metrics/playerCard";
import { useGrind } from "@/hooks/useGrind";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Targets = any; // the useRateTargets shape (weekStart)

// ISO-8601 week number, UTC-anchored like every other date in the app.
const isoWeek = (d: Date): number => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
};

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-[7px] h-[26px] px-[11px] rounded-full border border-hairline font-condensed font-semibold text-[12.5px] tracking-[.08em] text-dim whitespace-nowrap">
    {children}
  </span>
);

// The approved A+C statusbar: page identity, the day/week/pay-week line, and
// the quiet honors (rank + streak) on the right. Full-bleed — the sidebar
// trigger lives here now, not in a chrome bar above the page.
export const OpsStatusbar = ({
  loads,
  trips,
  targets,
}: {
  loads: Load[];
  trips: Trip[];
  targets: Targets;
}) => {
  const now = useMemo(() => new Date(), []);
  const grind = useGrind(loads);
  const streak = grind?.currentStreak ?? 0;

  // Rank rides the rig's odometer — same basis the Garage uses. Highest
  // recorded reading across loads and trips is "lifetime miles".
  const rank = useMemo(() => {
    const odo = Math.max(
      0,
      ...loads.map((l) => l.odometer_end ?? 0),
      ...trips.map((t) => t.odometer_end ?? 0),
    );
    return odo > 0 ? careerRank(odo) : null;
  }, [loads, trips]);

  const dateLine = useMemo(() => {
    const parts = [
      now.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
      `Week ${isoWeek(now)}`,
    ];
    if (targets.weekStart) {
      const ws = new Date(targets.weekStart);
      const a = DAY[ws.getUTCDay()];
      const b = DAY[(ws.getUTCDay() + 6) % 7];
      parts.push(`pay week ${a}–${b}`);
    }
    return parts.join(" · ");
  }, [now, targets.weekStart]);

  return (
    <div className="flex items-center gap-x-[18px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
      <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
      <h1 className="font-display text-[26px] tracking-[.06em] leading-none text-ink">
        OPERATIONS
      </h1>
      <span className="font-condensed font-medium text-[15px] text-dim">
        {dateLine}
      </span>
      <span className="flex-1" />
      {rank && (
        <Chip>
          <span
            className="w-1.5 h-1.5 rounded-full bg-amber"
            style={{ boxShadow: "0 0 6px rgba(232,148,10,.9)" }}
          />
          <b className="text-ink font-semibold">{rank.name}</b>
        </Chip>
      )}
      {grind && (
        <Chip>
          Streak <b className="text-ink font-semibold">×{streak}</b>
        </Chip>
      )}
    </div>
  );
};
