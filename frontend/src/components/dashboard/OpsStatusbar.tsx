import { useMemo } from "react";
import { Link } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useLocalTodayKey } from "@/hooks/useLocalToday";

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

const Chip = ({ children, tone }: { children: React.ReactNode; tone?: "amber" }) => (
  <span
    className={`inline-flex items-center gap-[7px] h-[26px] px-[11px] rounded-full border border-hairline font-condensed font-semibold text-[12.5px] tracking-[.08em] whitespace-nowrap ${tone === "amber" ? "text-amber-hi" : "text-dim"}`}
  >
    {children}
  </span>
);

// The approved A+C statusbar: page identity, the day/week/pay-week line, and
// the Integrity chip on the right (the career rank and streak chips left in
// the Cockpit rebuild). Full-bleed — the sidebar
// trigger lives here now, not in a chrome bar above the page.
export const OpsStatusbar = ({
  targets,
  integrityOpen = 0,
}: {
  targets: Targets;
  // The viewer's open Integrity count; the chip hides at zero (and while loading).
  integrityOpen?: number;
}) => {
  // The local day as a LOCAL-noon Date — formatted local below (never an
  // anchored UTC midnight through local getters) — re-made when the day turns
  // so a tab left open says the new day at midnight (call 13).
  const todayKey = useLocalTodayKey();
  const now = useMemo(() => new Date(`${todayKey}T12:00:00`), [todayKey]);
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
      {integrityOpen > 0 && (
        <Link to="/integrity">
          <Chip tone="amber">INTEGRITY · {integrityOpen} OPEN ›</Chip>
        </Link>
      )}
    </div>
  );
};
