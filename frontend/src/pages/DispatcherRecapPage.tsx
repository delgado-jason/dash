import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLoads } from "@/hooks/useLoads";
import { useRateTargets } from "@/hooks/useRateTargets";
import { usePersonalGrind } from "@/hooks/useGrind";
import { getUser } from "@/services/teamService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { resolvePeriod, type RecapScope, type RecapRange } from "@/lib/metrics/recap";
import { currentRange, loadsInPeriod } from "@/lib/metrics/dispatcherSeason";
import { dispatcherRecap } from "@/lib/metrics/dispatcherRecap";
import { DispatcherRecapPoster } from "@/components/recap/DispatcherRecapPoster";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

const SCOPES: { key: RecapScope; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year", label: "Year" },
];

// ago 0 = the in-progress period; ago n = the n-th FINISHED period back
// (resolvePeriod's 0 is the most recent complete one).
const rangeAt = (scope: RecapScope, ago: number, now: Date): RecapRange =>
  ago === 0 ? currentRange(scope, now) : resolvePeriod(scope, ago - 1, now);

// A dispatcher's own recap — only the loads she booked, all gross. Never
// touches expenses, obligations, or fuel.
const DispatcherRecapPage = () => {
  const { loads } = useLoads(0);
  const targets = useRateTargets(loads);
  const now = useMemo(() => new Date(), []);

  const selfId = localStorage.getItem("user_id") ?? "";
  const mine = useMemo(
    () => (selfId ? loads.filter((l) => l.booked_by === selfId) : []),
    [loads, selfId],
  );
  const grind = usePersonalGrind(mine);

  const [who, setWho] = useState("you");
  const [freeHours, setFreeHours] = useState(3);
  const [scope, setScope] = useState<RecapScope>("month");
  const [ago, setAgo] = useState(0);

  useEffect(() => {
    if (!selfId) return;
    getUser(selfId)
      .then((u) => {
        if (u.display_name) setWho(u.display_name);
      })
      .catch(() => {});
    getSettlementSchedule()
      .then((s) => setFreeHours(s.detention_free_hours))
      .catch(() => {});
  }, [selfId]);

  const range = useMemo(() => rangeAt(scope, ago, now), [scope, ago, now]);
  const stats = useMemo(
    () => dispatcherRecap(loads, selfId, scope, range, targets.bookingLadder, freeHours),
    [loads, selfId, scope, range, targets.bookingLadder, freeHours],
  );

  const canNext = ago > 0;
  const canPrev = loadsInPeriod(mine, selfId, rangeAt(scope, ago + 1, now)).length > 0;

  const pick = (s: RecapScope) => {
    setScope(s);
    setAgo(0);
  };

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <h1 className="text-3xl font-condensed">Recap</h1>
        <SegmentedTabs
          ariaLabel="Recap period"
          tabs={SCOPES.map((s) => ({ value: s.key, label: s.label }))}
          value={scope}
          onChange={pick}
        />
      </div>

      <div className="flex items-center justify-center gap-4 mb-4">
        <button
          onClick={() => canPrev && setAgo(ago + 1)}
          disabled={!canPrev}
          className="text-muted-text disabled:opacity-30 hover:text-light"
          aria-label="Earlier"
        >
          <ChevronLeft size={22} />
        </button>
        <span className="font-condensed text-lg w-32 text-center">{range.label}</span>
        <button
          onClick={() => canNext && setAgo(ago - 1)}
          disabled={!canNext}
          className="text-muted-text disabled:opacity-30 hover:text-light"
          aria-label="Later"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {!stats.hasData ? (
        <p className="text-center text-muted-text mt-10">
          No loads booked in {range.label} yet.
        </p>
      ) : (
        <DispatcherRecapPoster
          stats={stats}
          bestStreak={grind?.bestStreak ?? 0}
          who={who}
          inProgress={ago === 0}
        />
      )}
    </div>
  );
};

export default DispatcherRecapPage;
