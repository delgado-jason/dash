import type { NationalDiesel } from "@/types/fuelEntry";
import { dieselPrice } from "@/lib/format";

const fmtWeek = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

// "You vs. national" — your blended cost/gal against the EIA weekly U.S. retail
// diesel number. Beating the national average earns a comic win stamp.
export const DieselCompareCard = ({
  national,
  yourCostPerGallon,
}: {
  national: NationalDiesel | null;
  yourCostPerGallon: number | null;
}) => {
  if (!national) return null;

  const delta =
    yourCostPerGallon == null ? null : yourCostPerGallon - national.value;
  const under = delta != null && delta < 0;
  const deltaColor = delta == null ? "#9daabb" : under ? "#4ade80" : "#e8940a";

  return (
    <div className="ds2-board p-4 mt-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs text-faint uppercase tracking-wider">
            You vs. national diesel
          </p>
          <p className="text-[11px] text-faint mt-0.5">
            U.S. retail avg · week of {fmtWeek(national.period)} · EIA
          </p>
        </div>
        {under && <span className="font-forge font-bold text-[12px] tracking-[.12em] text-[#6fd08c] border-2 border-[#6fd08c] rounded-[6px] px-[10px] py-[2px] -rotate-3">UNDER THE NATIONAL</span>}
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <div>
          <p className="text-xs text-faint">National avg</p>
          <p className="text-2xl font-condensed mt-1 text-ink">
            {dieselPrice(national.value)}
          </p>
        </div>
        <div>
          <p className="text-xs text-faint">Your avg / gal</p>
          <p className="text-2xl font-condensed mt-1 text-ink">
            {yourCostPerGallon == null ? "—" : dieselPrice(yourCostPerGallon)}
          </p>
        </div>
        <div>
          <p className="text-xs text-faint">
            {delta == null ? "Difference" : under ? "You save" : "Over by"}
          </p>
          <p
            className="text-2xl font-condensed mt-1"
            style={{ color: deltaColor }}
          >
            {delta == null ? "—" : `${under ? "−" : "+"}$${Math.abs(delta).toFixed(3)}`}
          </p>
        </div>
      </div>
    </div>
  );
};
