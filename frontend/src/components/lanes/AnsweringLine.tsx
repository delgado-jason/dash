import type { LedgerHeadline } from "@/lib/metrics/marketLedger";
import { rpm as fmtRpm } from "@/lib/format";

// The answering line never prints a figure it doesn't have.
const days1 = (n: number | null): string => (n == null ? "—" : n.toFixed(1));
const miles0 = (n: number | null): string =>
  n == null ? "—" : String(Math.round(n));

// THE one sentence that answers "where does my freight run?" — shared by the
// Lanes PAGE and the dashboard's Lanes TAB so the two can never drift apart.
// Every clause drops out when its figure is null: a figure with no data behind
// it is omitted, never printed as a zero.
//
// `areaWord` names the row's unit at the caller's own grain ("state",
// "region", "market"), so the same sentence reads in the caller's vocabulary.
// The margin is the caller's business — the page wants mt-4, the tab sits
// inside a Panel and wants none — so it arrives as `className`.
export const AnsweringLine = ({
  head,
  areaWord,
  className = "",
}: {
  head: LedgerHeadline;
  areaWord: string;
  className?: string;
}) => {
  const emptyPct =
    head.emptyShare == null ? null : Math.round(head.emptyShare * 100);

  return (
    <div
      className={`flex items-baseline gap-3 flex-wrap font-condensed text-[15px] text-dim ${className}`}
    >
      <span className="font-condensed font-semibold text-[22.5px] tabular-nums text-ink">
        {head.loads} LOAD{head.loads === 1 ? "" : "S"}
      </span>
      <span>
        · {head.originStates} origin {areaWord}
        {head.originStates === 1 ? "" : "s"} · {head.deliveryStates} delivery{" "}
        {areaWord}
        {head.deliveryStates === 1 ? "" : "s"}
        {emptyPct != null && (
          <>
            {" "}
            · <b className="font-semibold text-ink">{emptyPct}%</b> of your miles
            empty
          </>
        )}
        {head.bestOut && (
          <>
            {" "}
            · best market to load{" "}
            <b className="font-semibold text-status-positive-text">
              {head.bestOut.state} {fmtRpm(head.bestOut.out.typicalRpm)}/mi
            </b>{" "}
            ({head.bestOut.out.loads})
          </>
        )}
        {head.easiestIn && (
          <>
            {" "}
            · easiest place to get empty{" "}
            <b className="font-semibold text-status-positive-text">
              {head.easiestIn.state}
            </b>{" "}
            ({head.easiestIn.in.shareMedian != null
              ? `${Math.round(head.easiestIn.in.shareMedian * 100)}% of the next load`
              : `${miles0(head.easiestIn.in.reloadMilesMedian)} mi, ${days1(head.easiestIn.in.idleDaysAvg)} days`})
          </>
        )}
        {head.costliestIn && (
          <>
            {" "}
            · costliest{" "}
            <b className="font-semibold text-status-negative-text">
              {head.costliestIn.state}
            </b>{" "}
            ({head.costliestIn.in.shareMedian != null
              ? `${Math.round(head.costliestIn.in.shareMedian * 100)}% of the next load`
              : `${miles0(head.costliestIn.in.reloadMilesMedian)} mi, ${days1(head.costliestIn.in.idleDaysAvg)} days`})
          </>
        )}
        {/* said once, here: a delivered load with no pickup date can't be
            sequenced, so it is out of every IN figure that follows */}
        {head.undated > 0 && <> · {head.undated} undated</>}
      </span>
    </div>
  );
};
