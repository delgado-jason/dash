import { Link } from "react-router-dom";
import { FetchFailed } from "@/components/integrity/FetchFailed";
import type { CashBoard } from "@/lib/metrics/cashBoard";
import { waitsFor, blankInputs, sinceLineCount } from "@/lib/metrics/cashBoardInput";
import { cashAsOf } from "@/lib/metrics/cashToday";
import { useLocalToday } from "@/hooks/useLocalToday";
import { money } from "@/lib/format";
import { dayWords } from "./words";

const LINK = "text-amber-hi hover:text-hot underline-offset-2 hover:underline";

// BAND 1 · the hero plate's left figure: CASH ON HAND — the cash board's own current-period
// ending against the Ops float line. No second derivation: `board` is
// buildCashBoard on the one assembled input the Cash Flow page also uses.
export const CashPlate = ({
  board,
  floatLine,
  loading,
  failed,
  retry,
  assumptionsMissing,
}: {
  board: CashBoard | null;
  floatLine: number | null; // the active plan's Ops float line
  loading: boolean;
  failed: string[];
  retry: () => void;
  assumptionsMissing: boolean; // loaded fine, but there is no planning-assumptions row
}) => {
  const col = board?.columns[0] ?? null;
  const ending = col?.ending ?? null;
  return (
    <div data-testid="cash-plate">
      <p className="ds2-label">Cash on hand</p>
      {loading ? (
        <p className="font-display text-[36px] leading-none mt-1.5 tabular-nums text-faint">…</p>
      ) : failed.length > 0 && !board ? (
        <FetchFailed what={failed.join(", ")} onRetry={retry} className="mt-2" />
      ) : assumptionsMissing ? (
        <p className="text-[13px] text-amber-hi mt-2">
          Needs your planning assumptions first —{" "}
          <Link to="/cashflow" className={LINK}>set them up on Cash Flow ›</Link>
        </p>
      ) : !board || !col ? (
        <p className="text-[13px] text-amber-hi mt-2">
          Needs a balance — take a{" "}
          <Link to="/status" className={LINK}>Friday snapshot</Link> or type{" "}
          <Link to="/cashflow" className={LINK}>OPS NOW</Link>.
        </p>
      ) : (
        <>
          <PlateBody board={board} ending={ending} floatLine={floatLine} />
          {failed.length > 0 && (
            <FetchFailed what={failed.join(", ")} detail="the board runs without them until they load" onRetry={retry} className="mt-2" />
          )}
        </>
      )}
    </div>
  );
};

const PlateBody = ({ board, ending, floatLine }: { board: CashBoard; ending: number | null; floatLine: number | null }) => {
  const col = board.columns[0];
  // This morning's money: the number walked by every counted line dated up to
  // today, and no further. The column's ending (after the deposit that lands
  // once the period closes) is Tuesday's money and prints beneath it.
  const now = useLocalToday();
  const today = cashAsOf(board, now.toISOString().slice(0, 10));
  const since = today.amount != null ? today.linesSince : sinceLineCount(board);
  const why = today.missing.length > 0 ? today.missing : col.missing.length > 0 ? col.missing : board.missing;
  const gap = today.amount != null && floatLine != null ? today.amount - floatLine : null;
  return (
    <>
      {today.amount != null ? (
        <p className="font-display text-[36px] tracking-[.02em] leading-none mt-1.5 tabular-nums">
          {money(today.amount)}
          <span className="text-[15px] text-dim font-condensed tracking-normal"> today</span>
        </p>
      ) : (
        <p className="text-[13px] text-amber-hi mt-2">
          {why.length > 0
            ? `waits for ${waitsFor(why)} — ${blankInputs(why.length)}, no figure`
            : "waits for the current period’s lines"}
          {" "}
          <Link to="/cashflow" className={LINK}>Set it on Cash Flow ›</Link>
        </p>
      )}
      <p className="text-[11.5px] text-faint mt-2">
        {board.base.kind === "check" ? "OPS NOW" : "Snapshot"} {money(board.base.balance)} · {dayWords(board.base.date)} · since your number: {since} line{since === 1 ? "" : "s"}
        {ending != null && (
          <> · ending {dayWords(col.week.end)} after the deposit lands: <b className="text-dim tabular-nums">{money(ending)}</b></>
        )}
      </p>
      {gap != null && floatLine != null ? (
        <p className={`text-[12.5px] font-semibold mt-1.5 ${gap < 0 ? "text-status-negative-text" : "text-status-positive-text"}`}>
          {gap < 0 ? `under the ${money(floatLine)} float by ${money(-gap)}` : `over the float by ${money(gap)}`}
        </p>
      ) : ending != null ? (
        <p className="text-[12.5px] text-amber-hi mt-1.5">
          The float line isn’t set —{" "}
          <Link to="/status" className={LINK}>set it in EDIT PLAN ›</Link>
        </p>
      ) : null}
    </>
  );
};
