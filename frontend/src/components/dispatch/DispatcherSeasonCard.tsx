import { useMemo, useState } from "react";
import type { Load } from "@/types/load";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import type { RecapScope } from "@/lib/metrics/recap";
import { currentSeason, dispatchSeasonLog } from "@/lib/metrics/dispatcherSeason";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Panel } from "@/components/ui/Panel";
import { money, rpm as fmtRpm } from "@/lib/format";

const Stat = ({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
}) => (
  <div className="min-w-0">
    <p className="ds2-label">{label}</p>
    <p className="font-condensed font-semibold text-[24px] leading-none mt-1.5 tabular-nums">{value}</p>
    {sub && <p className="text-[12px] text-faint mt-1">{sub}</p>}
  </div>
);

const SCOPE_TABS = [
  { value: "month" as RecapScope, label: "Month" },
  { value: "quarter" as RecapScope, label: "Quarter" },
  { value: "year" as RecapScope, label: "Year" },
];

// A dispatcher's month / quarter / year: this period's booked-load figures and
// a strip of recent completed periods with their load counts. Plain since the
// Redesign's phase B1 — the three period trophies and their meters were the
// game's; the engine (dispatcherSeason) still computes them, nothing reads them.
export const DispatcherSeasonCard = ({
  loads,
  userId,
  ladder,
  freeHours,
  now = new Date(),
}: {
  loads: Load[];
  userId: string;
  ladder: RateLadder;
  freeHours: number;
  now?: Date;
}) => {
  // Land on the grandest current period that has data (year → quarter → month).
  const defaultScope = useMemo<RecapScope>(() => {
    for (const s of ["year", "quarter", "month"] as RecapScope[])
      if (currentSeason(loads, userId, s, freeHours, now).hasData) return s;
    return "month";
  }, [loads, userId, freeHours, now]);

  const [scope, setScope] = useState<RecapScope>(defaultScope);
  const season = useMemo(
    () => currentSeason(loads, userId, scope, freeHours, now),
    [loads, userId, scope, freeHours, now],
  );
  const log = useMemo(
    () => dispatchSeasonLog(loads, userId, scope, freeHours, now),
    [loads, userId, scope, freeHours, now],
  );

  const target = ladder.target;
  const rateTone =
    season.avgRpm != null && target != null
      ? season.avgRpm >= target
        ? "text-status-positive-text"
        : "text-status-aware-text"
      : "";

  return (
    <Panel className="p-4" data-testid="dispatcher-season">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="ds2-label">Season</span>
        <span className="text-xs text-faint">· {season.label}</span>
        <div className="ml-auto">
          <SegmentedTabs
            size="sm"
            ariaLabel="Season period"
            tabs={SCOPE_TABS}
            value={scope}
            onChange={setScope}
          />
        </div>
      </div>

      {!season.hasData ? (
        <p className="text-sm text-faint py-4">
          No loads booked this {scope} yet — they'll show up here as you book.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-5 gap-y-4">
          <Stat label="Loads booked" value={String(season.loadsBooked)} />
          <Stat label="Gross booked" value={money(season.grossBooked)} />
          <Stat
            label="Avg rate"
            value={fmtRpm(season.avgRpm)}
            sub={
              season.avgRpm != null && target != null ? (
                <span className={rateTone}>
                  {season.avgRpm >= target ? "over" : "under"} the {fmtRpm(target)} target
                </span>
              ) : (
                "gross per mile"
              )
            }
          />
          <Stat
            label="On-time"
            value={season.onTimePct == null ? "—" : `${Math.round(season.onTimePct * 100)}%`}
          />
          <Stat label="Best load" value={season.bestLoad == null ? "—" : money(season.bestLoad)} />
        </div>
      )}

      {log.some((e) => e.loads > 0) && (
        <div className="flex items-center gap-2 flex-wrap mt-4 pt-3 border-t ds2-cell-rule">
          <span className="ds2-label mr-1">Completed periods</span>
          {log.map((e) => (
            <span
              key={e.label}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-lo px-2.5 py-1 text-[12px] text-dim tabular-nums"
            >
              {e.label}
              <span className="text-faint">· {e.loads} load{e.loads === 1 ? "" : "s"}</span>
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
};
