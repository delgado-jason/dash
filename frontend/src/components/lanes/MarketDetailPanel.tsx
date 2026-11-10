import { Link } from "react-router-dom";
import type { DeliveryStory, MarketDetail, NextLeg } from "@/lib/metrics/marketLedger";
import type { MarketGrade } from "@/lib/metrics/marketFactor";
import { money, rpm } from "@/lib/format";
import { legCost, type GradeCosts } from "@/lib/metrics/marketFactor";
import { shortDate } from "@/lib/relationships/dayKeys";
import { GradeChip } from "./MarketLedger";

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const otColor = (n: number | null) =>
  n == null ? "var(--color-muted-text)" : n >= 0.9 ? "var(--color-status-positive-text)" : n >= 0.7 ? "var(--color-amber)" : "var(--color-status-negative-text)";

// "Aug 11 · PA" — the next load's origin MARKET when the book names one, else
// its state. "again" when you reloaded in the market this load came from.
const nextPickup = (next: NextLeg | null, fromMarket: string): string => {
  if (!next) return "—";
  const where = next.originMarket ?? next.originState ?? "—";
  const again = next.originMarket && next.originMarket === fromMarket ? " again" : "";
  return `${shortDate(next.pickupDay) ?? next.pickupDay} · ${where}${again}`;
};

// A deadhead of 0 on the next load is a deadhead nobody logged — never free.
const emptyCell = (next: NextLeg | null): string => {
  if (!next) return "—";
  return next.deadheadMiles == null ? "not logged" : `${Math.round(next.deadheadMiles)} mi`;
};

const idleCell = (story: DeliveryStory): string => {
  if (!story.next || story.next.idleDays == null) return "—";
  return `${story.next.idleDays} d${story.home ? " (home)" : ""}`;
};

export const MarketDetailPanel = ({
  detail,
  costs,
  market,
  outGrade,
  onClear,
}: {
  detail: MarketDetail;
  // The ladder's costs — a leg's reload is priced with them (legCost).
  costs: GradeCosts;
  market: string;
  // The market's OUT grade, worn on the agents line in the same chip the ledger
  // uses — one vocabulary for one fact, so "1 load · thin" reads the same here
  // as it does in the row you clicked.
  outGrade: MarketGrade;
  onClear: () => void;
}) => (
  <div className="ds2-board mt-4 p-5">
    <div className="flex items-baseline justify-between border-b border-hairline pb-2.5 mb-3.5">
      <span className="ds2-label">Market detail · {market}</span>
      <button
        type="button"
        onClick={onClear}
        className="text-xs text-dim hover:text-ink flex items-center gap-1"
      >
        clear ✕
      </button>
    </div>

    <div className="ds2-label flex items-baseline gap-2 mb-2">
      Agents you've booked out of {market}
      <span className="normal-case tracking-normal font-normal text-faint">
        {detail.loadsOut.length} load{detail.loadsOut.length === 1 ? "" : "s"} ·{" "}
        <GradeChip grade={outGrade} />
      </span>
    </div>
    {detail.agents.length === 0 ? (
      <p className="text-sm text-dim">
        No delivered loads out of {market} in this window.
      </p>
    ) : (
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-dim text-left">
            <th className="font-normal py-1">AGENT</th>
            <th className="font-normal text-right">$/MI</th>
            <th className="font-normal text-right">LOADS</th>
            <th className="font-normal text-right">ON-TIME</th>
          </tr>
        </thead>
        <tbody>
          {detail.agents.map((a) => (
            <tr key={a.agentId} className="border-t border-hairline-lo">
              <td className="py-2">
                <Link
                  to={`/agents/${a.agentId}`}
                  className="text-status-info-text hover:underline"
                >
                  {a.agent}
                </Link>
              </td>
              <td className="text-right tabular-nums">{rpm(a.medianRpm)}</td>
              <td className="text-right text-dim">{a.loadCount}</td>
              <td
                className="text-right tabular-nums"
                style={{ color: otColor(a.onTimePct) }}
              >
                {pct(a.onTimePct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}

    <div className="ds2-label mt-5 mb-2">
      Delivered here · {detail.deliveries.length} · what came next
    </div>
    {detail.deliveries.length === 0 ? (
      <p className="text-sm text-dim">Nothing has delivered here in this window.</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-[14.5px]">
          <thead>
            <tr className="text-[11.5px] font-semibold tracking-[.1em] uppercase text-faint text-left">
              <th className="font-semibold py-1.5 pr-3 border-b border-hairline">Delivered</th>
              <th className="font-semibold py-1.5 pr-3 border-b border-hairline">From</th>
              <th className="font-semibold py-1.5 pr-3 border-b border-hairline text-right">Paid</th>
              <th className="font-semibold py-1.5 pr-3 border-b border-hairline">Next pickup</th>
              <th className="font-semibold py-1.5 pr-3 border-b border-hairline text-right">Empty</th>
              <th className="font-semibold py-1.5 border-b border-hairline text-right">Idle</th>
            </tr>
          </thead>
          <tbody>
            {detail.deliveries.map((s) => (
              <tr key={s.load.load_id} className="text-dim border-b border-hairline-lo">
                <td className="py-2 pr-3">
                  {shortDate(s.deliveredDay) ?? "—"}
                  {s.deliveredMarket && <> · {s.deliveredMarket}</>}
                </td>
                <td className="py-2 pr-3">{s.fromMarket || "—"}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  <b className="text-ink font-semibold">{money(s.gross)}</b>
                </td>
                <td className="py-2 pr-3">{nextPickup(s.next, s.fromMarket)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {s.next?.deadheadMiles == null ? (
                    emptyCell(s.next)
                  ) : (
                    <b className="text-ink font-semibold">{emptyCell(s.next)}</b>
                  )}
                  {!s.home && legCost(s.next, costs) && (
                    <span className="block text-[12.5px] text-faint">
                      {money(legCost(s.next, costs)!.cost)} · {Math.round(legCost(s.next, costs)!.share * 100)}% of the next load
                    </span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">{idleCell(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    <p className="text-[14px] text-faint mt-2">
      "not logged" is a deadhead of 0 on the next load — the page never reads 0 as
      free. Home comes from your logged home trips or a gap over a week; idle counts
      weekdays. A reload's dollars are its empty miles at your cost per mile plus
      its idle weekdays at the truck's fixed cost per day, shown as a share of the
      load it led to — the grade is strong under your margin goal, soft past twice it.
    </p>
  </div>
);
