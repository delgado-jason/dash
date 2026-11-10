import type { ReactNode } from "react";
import type { TankRecap } from "@/lib/metrics/fuelEconomy";
import { money, dieselPrice, formatDate } from "@/lib/format";

const GOOD = "var(--color-status-positive-text)";
const BAD = "var(--color-status-negative-text)";

const signed = (n: number, d = 2) =>
  `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(d)}`;

const Cell = ({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: ReactNode;
}) => (
  <div
    className="rounded-[10px] p-3"
    style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline-lo)" }}
  >
    <p className="font-condensed text-[12px] uppercase tracking-[.12em] text-faint">{label}</p>
    <p className="font-condensed text-xl font-semibold mt-0.5 tabular-nums">{value}</p>
    <p className="font-condensed text-xs mt-0.5">{sub}</p>
  </div>
);

// The "how did my last tank do?" scorecard — the most recent completed tank,
// scored against his own history. See latestTankRecap for the math.
export const LatestTankCard = ({
  recap,
  place,
}: {
  recap: TankRecap | null;
  place?: string | null;
}) => {
  if (!recap) return null;
  const { tank, isRecord, mpgVsAvg, mpgVsLast, cpmVsAvg, ppgVsNational } = recap;

  return (
    <div
      className="relative overflow-hidden rounded-[14px] border mt-4 bg-panel"
      style={{
        borderColor: isRecord ? "color-mix(in srgb, var(--color-amber-hi) 50%, transparent)" : "var(--color-hairline)",
      }}
    >
      <div className="flex items-center gap-[14px] px-[18px] py-[13px] border-b ds2-cell-rule flex-wrap">
        <div className="min-w-0">
          <div className="font-condensed font-semibold text-[16px] tracking-[.1em] uppercase leading-none">
            THE LAST TANK
          </div>
          <div className="font-condensed text-[12px] text-faint tracking-[.1em] uppercase mt-[3px]">
            closed {formatDate(tank.date) ?? ""}
            {place ? ` · ${place}` : ""}
          </div>
        </div>
        {isRecord ? (
          <span className="ml-auto font-condensed font-bold text-sm uppercase tracking-[.04em] text-amber-hi">
            NEW BEST
          </span>
        ) : mpgVsAvg != null && mpgVsAvg >= 0 ? (
          <span className="ml-auto font-condensed font-bold text-[11.5px] tracking-[.12em] px-[8px] py-[3px] rounded-[4px] text-status-positive-text border border-status-positive-text/35 bg-status-positive-text/8">
            ABOVE YOUR AVERAGE
          </span>
        ) : null}
      </div>
      <div className="px-[18px] py-4">

      <div className="flex items-end gap-2 flex-wrap">
        <span
          className="text-[56px] font-condensed font-semibold tabular-nums leading-none"
          style={isRecord ? { color: "var(--color-amber-hi)" } : undefined}
        >
          {tank.mpg.toFixed(2)}
        </span>
        <span className="font-condensed text-[14px] tracking-[.12em] uppercase text-faint mb-1.5">MPG · this tank</span>
        <span className="ml-1.5 text-sm mb-1">
          {mpgVsAvg != null ? (
            <span style={{ color: mpgVsAvg >= 0 ? GOOD : BAD }}>
              {mpgVsAvg >= 0 ? "▲" : "▼"}{" "}
              {signed(mpgVsAvg)} vs your average
            </span>
          ) : (
            <span className="text-faint">your first full tank</span>
          )}
          {mpgVsLast != null && (
            <span className="text-faint"> · {signed(mpgVsLast)} vs last</span>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <Cell
          label="Fuel cost / mile"
          value={`$${recap.costPerMile.toFixed(2)}`}
          sub={
            cpmVsAvg != null ? (
              <span style={{ color: cpmVsAvg <= 0 ? GOOD : BAD }}>
                {cpmVsAvg <= 0 ? "▼" : "▲"}{" "}
                ${Math.abs(cpmVsAvg).toFixed(2)} {cpmVsAvg <= 0 ? "under" : "over"}{" "}
                30-day avg
              </span>
            ) : (
              <span className="text-faint">no average yet</span>
            )
          }
        />
        <Cell
          label="Price / gallon"
          value={dieselPrice(recap.pricePerGallon)}
          sub={
            ppgVsNational != null ? (
              <span style={{ color: ppgVsNational <= 0 ? GOOD : BAD }}>
                ${Math.abs(ppgVsNational).toFixed(2)}{" "}
                {ppgVsNational <= 0 ? "under" : "over"} national
              </span>
            ) : (
              <span className="text-faint">national n/a</span>
            )
          }
        />
        <Cell
          label="This tank"
          value={`${Math.round(tank.miles).toLocaleString("en-US")} mi`}
          sub={
            <span className="text-faint">
              {tank.gallons.toFixed(0)} gal · {money(tank.cost)} spent
            </span>
          }
        />
      </div>

      {recap.streak >= 2 && (
        <div
          className="mt-3 font-condensed font-semibold text-sm tracking-[.04em]"
          style={{ color: "var(--color-amber-hi)" }}
        >
          ▲ {recap.streak} tanks running at or above your average
        </div>
      )}
      </div>
    </div>
  );
};
