import { useMemo, useState } from "react";
import { Trophy, Lock } from "lucide-react";
import type { Load } from "@/types/load";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import type { RecapScope } from "@/lib/metrics/recap";
import {
  currentSeason,
  dispatchSeasonLog,
  type SeasonTrophy,
} from "@/lib/metrics/dispatcherSeason";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { money, rpm as fmtRpm } from "@/lib/format";

const GOLD = "#fcd34d";

const Stat = ({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
}) => (
  <div>
    <p className="text-[10.5px] uppercase tracking-wide text-muted-text">
      {label}
    </p>
    <p className="text-lg font-semibold mt-0.5">{value}</p>
    {sub && <p className="text-[11px] mt-0.5">{sub}</p>}
  </div>
);

const TrophyTile = ({ t }: { t: SeasonTrophy }) => (
  <div
    className="rounded-xl p-3 text-center border"
    style={
      t.earned
        ? { background: "#2a2410", borderColor: "#f5a623" }
        : { background: "#121a26", borderColor: "#232d43", opacity: 0.75 }
    }
  >
    <div className="flex justify-center" style={{ color: t.earned ? GOLD : "#586b86" }}>
      {t.earned ? <Trophy size={22} /> : <Lock size={20} />}
    </div>
    <p className="text-[12.5px] font-semibold mt-1.5">{t.name}</p>
    <p
      className="text-[11px] mt-0.5"
      style={{ color: t.earned ? GOLD : "#8b97a8" }}
    >
      {t.detail}
    </p>
  </div>
);

const SCOPE_TABS = [
  { value: "month" as RecapScope, label: "Month" },
  { value: "quarter" as RecapScope, label: "Quarter" },
  { value: "year" as RecapScope, label: "Year" },
];

// A dispatcher's month/quarter/year season: this period's booked-load recap plus
// the three earnable period trophies, and a strip of recent finished periods.
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
      if (currentSeason(loads, userId, s, ladder, freeHours, now).hasData) return s;
    return "month";
  }, [loads, userId, ladder, freeHours, now]);

  const [scope, setScope] = useState<RecapScope>(defaultScope);
  const season = useMemo(
    () => currentSeason(loads, userId, scope, ladder, freeHours, now),
    [loads, userId, scope, ladder, freeHours, now],
  );
  const log = useMemo(
    () => dispatchSeasonLog(loads, userId, scope, ladder, freeHours, now),
    [loads, userId, scope, ladder, freeHours, now],
  );

  const target = ladder.target;
  const rateColor =
    season.avgRpm != null && target != null
      ? season.avgRpm >= target
        ? "#4ade80"
        : "#f5a623"
      : undefined;

  return (
    <section
      className="rounded-2xl border p-4 mt-4"
      style={{ background: "#141a26", borderColor: "#2a3347" }}
    >
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-[11px] tracking-[1.5px] text-muted-text uppercase">
          Season
        </span>
        <span className="text-xs text-muted-text">· {season.label}</span>
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
        <p className="text-sm text-muted-text py-4">
          No loads booked this {scope} yet — they'll show up here as you book.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
            <Stat label="Loads booked" value={String(season.loadsBooked)} />
            <Stat label="Gross booked" value={money(season.grossBooked)} />
            <Stat
              label="Avg rate"
              value={fmtRpm(season.avgRpm)}
              sub={
                season.avgRpm != null && target != null ? (
                  <span style={{ color: rateColor }}>
                    {season.avgRpm >= target ? "over" : "under"} {fmtRpm(target)}{" "}
                    target
                  </span>
                ) : undefined
              }
            />
            <Stat
              label="On-time"
              value={
                season.onTimePct == null
                  ? "—"
                  : `${Math.round(season.onTimePct * 100)}%`
              }
            />
            <Stat
              label="Best load"
              value={season.bestLoad == null ? "—" : money(season.bestLoad)}
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {season.trophies.map((t) => (
              <TrophyTile key={t.key} t={t} />
            ))}
          </div>
        </>
      )}

      {log.some((e) => e.loads > 0) && (
        <div className="flex items-center gap-2 flex-wrap mt-4">
          <span className="text-[11px] tracking-wide text-muted-text uppercase mr-1">
            Season log
          </span>
          {log.map((e) => (
            <span
              key={e.label}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px]"
              style={{
                background: "#0f1622",
                borderColor: "#26304a",
                color: "#9fb0c9",
              }}
            >
              {e.label}
              {e.trophies > 0 && (
                <span style={{ color: GOLD }} className="inline-flex gap-0.5">
                  {Array.from({ length: e.trophies }, (_, i) => (
                    <Trophy key={i} size={12} />
                  ))}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </section>
  );
};
