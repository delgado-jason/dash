import { Fragment } from "react";
import { money } from "@/lib/format";

// Design System v2 — the LED pace meter, the "forged = chase" hardware shared
// by Pulse (the week) and Money (the month's notes). The target anchors at
// ~78% of the track so there is always overdrive runway past it — targets get
// beaten regularly and the meter must show it (Jason's rule, 2026-08-09).
// Cells past the target burn hotter when lit. Marker labels are plain words.

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
      <div className="flex gap-[3px] h-[18px]">
        {Array.from({ length: cells }, (_, i) => {
          const on = i < filledCells;
          const com = !on && i < ghostCells;
          const tip = on && i === filledCells - 1;
          const od = i >= targetIdx; // overdrive territory
          return (
            <span
              key={i}
              className="flex-1 rounded-[2px]"
              style={
                on
                  ? {
                      background: od
                        ? "var(--color-hot)"
                        : tip
                          ? "var(--color-amber-hi)"
                          : "var(--color-chart-amber)",
                      boxShadow: od
                        ? "0 0 9px rgba(255,207,122,.7)"
                        : tip
                          ? "0 0 7px rgba(245,176,58,.5)"
                          : "inset 0 1px 0 rgba(255,255,255,.15)",
                    }
                  : com
                    ? {
                        background: od
                          ? "rgba(245,176,58,.55)"
                          : "rgba(200,127,10,.3)",
                        boxShadow: od
                          ? "0 0 6px rgba(245,176,58,.4)"
                          : undefined,
                      }
                    : {
                        background: "var(--color-well)",
                        boxShadow: "inset 0 1px 3px rgba(0,0,0,.5)",
                      }
              }
            />
          );
        })}
      </div>
      {markers.map((m) => (
        <Fragment key={m.label}>
          <div
            className="absolute -top-1.5 w-px h-[30px] bg-dim"
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
export const paceMarker = (label: string, value: number): PaceMarker => ({
  value,
  label: `${label} ${money(value)}`,
});
