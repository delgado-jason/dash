import { useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "@/components/ui/Panel";
import type { DetentionOwed } from "@/lib/metrics/dashboard";

const hm = (min: number): string => `${Math.floor(min / 60)} h ${min % 60} m`;

// BAND 3 · Detention owed — loads confirmed billable and not yet collected,
// from the dispatch board's own function (getDetentionOwed). Expands to the loads.
export const DetentionCard = ({ owed, freeHours }: { owed: DetentionOwed; freeHours: number }) => {
  const [open, setOpen] = useState(false);
  const n = owed.loadCount;
  return (
    <Panel className="p-4 h-full" data-testid="detention-card">
      <p className="ds2-label">Detention owed</p>
      {n === 0 ? (
        <p className="font-condensed font-semibold text-[19.5px] mt-1.5 text-ink">nothing owed</p>
      ) : (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="block w-full text-left mt-1.5"
          >
            <span className="font-condensed font-semibold text-[19.5px] leading-tight text-ink">
              {n} load{n === 1 ? "" : "s"} · {hm(owed.totalMinutes)} past the free {freeHours} hours · not yet billed
            </span>
            <span className="text-amber-hi text-[13px] ml-2">{open ? "hide ▴" : "show ▾"}</span>
          </button>
          {open && (
            <ul className="mt-2 divide-y ds2-cell-rule">
              {owed.items.map((i) => (
                <li key={i.load_id} className="py-1.5 flex items-baseline gap-2 text-[13px]">
                  <Link to={`/loads/${i.load_id}`} className="font-semibold text-ink hover:underline">{i.load_number}</Link>
                  <span className="text-faint truncate">{i.lane}</span>
                  <span className="ml-auto text-dim tabular-nums whitespace-nowrap">{i.minutes} min</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="text-[12px] text-faint mt-2">from the dispatch board</p>
    </Panel>
  );
};
