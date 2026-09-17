import type { RepeatLanes } from "@/lib/metrics/marketLedger";
import { fmtPerDay, perDayTone, type DailyTargets } from "@/lib/metrics/perDay";
import { perDayTextClass } from "./rpmStyle";
import { rpm as fmtRpm } from "@/lib/format";
import { shortDate } from "@/lib/relationships/dayKeys";

// Spot oversize barely repeats a lane, so lanes get one honest board: the ones
// you've run more than once. Everything else stays a single, counted under it.
export const RepeatLanesBoard = ({
  lanes,
  daily,
  onSelect,
}: {
  lanes: RepeatLanes;
  daily: DailyTargets | null;
  onSelect: (state: string) => void;
}) => (
  <div className="ds2-board mt-4">
    <div className="flex items-center gap-2.5 px-3.5 pt-2.5 pb-1.5">
      <span className="ds2-label">Repeat lanes</span>
      <span className="ml-auto font-condensed text-[11.5px] text-amber-hi">
        {lanes.rows.length} of {lanes.rows.length + lanes.singles} — the rest are
        singles
      </span>
    </div>

    {lanes.rows.length === 0 ? (
      <p className="text-dim text-sm px-3.5 pb-4">
        No lane in this window has run more than once.
      </p>
    ) : (
      lanes.rows.map((l) => (
        <button
          type="button"
          key={l.lane}
          onClick={() => onSelect(l.originState)}
          className="w-full text-left grid grid-cols-[minmax(0,1.6fr)_88px_92px_96px] gap-3 items-center px-3.5 py-2.5 border-t border-hairline-lo hover:bg-white/[.03]"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-condensed text-[15px] text-amber">{l.lane}</span>
              {l.types.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center h-5 px-2 rounded-[10px] font-condensed font-semibold text-[10px] tracking-[.09em] uppercase bg-amber/10 text-amber-hi"
                >
                  {t}
                </span>
              ))}
            </div>
            <div className="text-[11.5px] text-dim truncate mt-0.5">
              {l.states} · {l.agents.join(", ")}
              {l.lastDay && <> · last {shortDate(l.lastDay)}</>}
              {l.milesAvg != null && <> · {Math.round(l.milesAvg)} mi</>}
            </div>
          </div>
          <span className="font-condensed text-[13px] text-dim text-right">
            <b className="text-ink font-semibold">{l.loads}</b>
            <i className="not-italic block text-[11px] text-faint">loads</i>
          </span>
          <span className="font-condensed text-[13px] text-dim text-right">
            <b className="text-ink font-semibold">{fmtRpm(l.typicalRpm)}</b>
            <i className="not-italic block text-[11px] text-faint">typical</i>
          </span>
          <span
            className={`font-display text-[17px] text-right tabular-nums ${perDayTextClass(
              perDayTone(l.perDay.perDay, daily),
            )}`}
          >
            {fmtPerDay(l.perDay.perDay)}
            <small className="block font-condensed text-[10px] tracking-[.08em] uppercase text-faint">
              /day
            </small>
          </span>
        </button>
      ))
    )}

    <p className="px-3.5 py-2.5 border-t border-hairline-lo font-condensed text-[12.5px] text-dim">
      {lanes.singles} lane{lanes.singles === 1 ? "" : "s"} ran once · shown on the map
      when "lanes" is on, thin lines · the Guide's typical-vs-blended rule still
      governs every $/mi here
    </p>
  </div>
);
