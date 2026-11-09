import { Fragment } from "react";
import { money } from "@/lib/format";

// The pace meter — a segmented bar shared by the dispatch board (the week), Money
// (the month's threshold) and Fleet (the next service). The target anchors at
// ~78% of the track so there is always runway past it — targets get beaten
// regularly and the meter must show it (Jason's rule, 2026-08-09). Plain since
// the Redesign's phase B: one amber for the fill, a brighter amber past the
// target, no glow, no sunk cells. Marker labels are plain words.

export interface PaceMarker {
  value: number;
  label: string;
}

const TARGET_AT = 0.78;

export const PaceMeter = ({
  filled,
  ghost = 0,
  target,
  markers,
  cells = 26,
}: {
  filled: number; // earned / profit — solid amber
  ghost?: number; // committed on top of filled — dimmed
  target: number; // anchors at ~78%; scale grows if values overrun the runway
  markers: PaceMarker[]; // e.g. floor + target, or notes + goal
  cells?: number;
}) => {
  const scaleMax =
    Math.max(target / TARGET_AT, filled + ghost, ...markers.map((m) => m.value)) ||
    1;
  const cellVal = scaleMax / cells;
  const filledCells = Math.min(cells, Math.round(filled / cellVal));
  const ghostCells = Math.min(cells, Math.round((filled + ghost) / cellVal));
  const targetIdx = Math.round((target / scaleMax) * cells);

  return (
    <div className="relative mt-7 mb-1">
      <div className="flex gap-[3px] h-[14px]">
        {Array.from({ length: cells }, (_, i) => {
          const on = i < filledCells;
          const com = !on && i < ghostCells;
          const od = i >= targetIdx; // past the target
          return (
            <span
              key={i}
              className="flex-1 rounded-[2px]"
              style={{
                background: on
                  ? od
                    ? "var(--color-amber-hi)"
                    : "var(--color-chart-amber)"
                  : com
                    ? "color-mix(in srgb, var(--color-amber) 35%, transparent)"
                    : "var(--color-well)",
              }}
            />
          );
        })}
      </div>
      {markers.map((m) => (
        <Fragment key={m.label}>
          <div
            className="absolute -top-1.5 w-px h-[26px] bg-dim"
            style={{ left: `${(m.value / scaleMax) * 100}%` }}
          >
            <span className="absolute -top-[15px] left-1/2 -translate-x-1/2 text-[8.5px] font-semibold tracking-[.08em] uppercase text-faint whitespace-nowrap">
              {m.label}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  );
};

// Shared plain-words marker builder — "floor $6,800" / "target $9,180".
// eslint-disable-next-line react-refresh/only-export-components -- pre-existing, untouched by the colour sweep; owed to this page's phase C restructure
export const paceMarker = (label: string, value: number): PaceMarker => ({
  value,
  label: `${label} ${money(value)}`,
});
