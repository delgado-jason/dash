import type { OriginStateRollup } from "@/lib/metrics/lanes";
import { fmtRpm, rpmTextClass } from "./rpmStyle";

// The ranking that actually recurs for spot oversize: where the freight is
// born. Repeats only — one-load origins ride the map, not the board.
export const OriginMarkets = ({
  rollup,
  windowDays,
}: {
  rollup: OriginStateRollup;
  windowDays: number;
}) => {
  if (rollup.rows.length === 0 && rollup.singles === 0) return null;
  return (
    <div className="ds2-board overflow-hidden mt-4">
      <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
        <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
          Origin markets
        </span>
        <span className="font-condensed text-[12px] text-faint">
          · where the freight is born · last {windowDays}d
        </span>
        {rollup.best && (
          <span
            className="ml-auto font-display text-[13px] tracking-[.14em] text-amber-hi rounded-[4px] px-2 pt-[2px] pb-[1px] rotate-[-1.2deg]"
            style={{
              border: "1.5px solid rgba(245,176,58,.55)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.12), 0 1px 2px rgba(0,0,0,.5)",
            }}
          >
            BEST ORIGIN{" "}
            <span className="text-dim tracking-[.1em]">· {rollup.best.name.toUpperCase()}</span>
          </span>
        )}
      </div>
      {rollup.rows.map((r) => {
        const isBest = rollup.best?.state === r.state;
        return (
          <div
            key={r.state}
            className="flex items-center gap-[14px] px-4 py-[10px] border-t ds2-cell-rule first:border-t-0"
          >
            <span
              className={`font-display text-[19px] tracking-[.05em] w-[44px] ${isBest ? "text-amber-hi" : ""}`}
            >
              {r.state}
            </span>
            <span className="font-condensed font-semibold text-[15px] text-dim flex-1 min-w-0 truncate">
              {r.name}
            </span>
            <span className="font-condensed text-[13px] text-faint w-[80px] text-right tabular-nums">
              {r.loadCount} loads
            </span>
            <span
              className={`font-condensed font-semibold text-[15px] w-[90px] text-right tabular-nums ${rpmTextClass(r.blendedRpm)}`}
            >
              {r.blendedRpm != null ? `${fmtRpm(r.blendedRpm)}/mi` : "—"}
            </span>
          </div>
        );
      })}
      {rollup.singles > 0 && (
        <div className="font-condensed text-[12.5px] text-faint px-4 py-[9px] border-t ds2-cell-rule">
          + {rollup.singles} one-load origin{rollup.singles === 1 ? "" : "s"} — singles ride
          the map, not the ranking
        </div>
      )}
    </div>
  );
};
