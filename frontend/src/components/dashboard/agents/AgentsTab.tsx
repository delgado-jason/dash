import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Load } from "@/types/load";
import { useDeskBoard } from "@/hooks/useDeskBoard";
import {
  agentBook,
  bookShape,
  goneQuiet,
  workingWith,
  QUIET_DAYS,
  type AgentBookRow,
} from "@/lib/metrics/agentBook";
import {
  AGENCY_WINDOWS,
  WINDOW_LABEL,
  agencyRange,
  type AgencyWindow,
} from "@/lib/agencies/agencyMetrics";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import { nameOf } from "@/lib/relationships/nameOf";
import { Leaderboard } from "./Leaderboard";
import { Panel } from "@/components/ui/Panel";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { money, rpm as fmtRpm } from "@/lib/format";

// WHO SHOULD I CALL? (the Redesign, phase C, 3 of 4.) The Agents PAGE is the
// roster you search and filter; this tab is where the story lives, and the
// story on a spot book is not the one it used to tell. It warned about a
// concentration risk that does not exist here — one desk at 11.8% against a 30%
// cap — while the real shape of the book went unsaid: forty-four of fifty-five
// desks gave exactly one load, over half the money. So concentration became
// fragmentation, "going cold" became the desks that actually came back and then
// stopped, and the rate×volume scatter and gut-vs-data card came off (the first
// drew lifetime axes under a twelve-month tab, the second needs star ratings
// that are still at their default on 57 of 71 agents).
//
// Everything here reads the LEADERBOARD'S window and the leaderboard's date
// basis, so the tab can no longer answer "how much did this desk pay" three
// different ways on one screen.
const QUIET_SHOWN = 5;
const RECENT_SHOWN = 6;

const TH = "ds2-label pb-1.5 font-normal";
const TD_NUM = "py-[6px] font-condensed font-semibold tabular-nums text-right";

const plural = (n: number, word: string): string =>
  `${n} ${word}${n === 1 ? "" : "s"}`;

// A quiet desk warms from amber to negative as the weeks pass. Under the band
// it is simply ink — a desk you worked last month is not a warning.
const quietTone = (days: number | null): string =>
  days == null
    ? "text-faint"
    : days >= QUIET_DAYS * 2
      ? "text-status-negative-text"
      : days >= QUIET_DAYS
        ? "text-amber-hi"
        : "text-ink";

export const AgentsTab = ({
  loads,
  ladder,
}: {
  loads: Load[];
  ladder: RateLadder | null;
}) => {
  const [now] = useState(() => new Date());
  const [win, setWin] = useState<AgencyWindow>("12m");
  const { board, agents, contactsFailed, failed } = useDeskBoard(
    loads,
    ladder,
    now,
    win,
  );

  // The same range the board just used, so every panel below describes the
  // same loads the board ranked.
  const range = useMemo(() => agencyRange(win, now), [win, now]);
  const bookRows = useMemo(() => agentBook(loads, range, now), [loads, range, now]);
  const shape = useMemo(() => bookShape(bookRows), [bookRows]);
  const quiet = useMemo(() => goneQuiet(bookRows), [bookRows]);
  const recent = useMemo(
    () => workingWith(bookRows).slice(0, RECENT_SHOWN),
    [bookRows],
  );

  const byId = useMemo(
    () => new Map((agents ?? []).map((a) => [a.agent_id, a])),
    [agents],
  );
  const name = (r: AgentBookRow): string => {
    const a = byId.get(r.agentId);
    return a ? nameOf(a) : "—";
  };
  const code = (r: AgentBookRow): string | null =>
    byId.get(r.agentId)?.posting_code?.trim() || null;

  // The best rate among desks that came back — a single load at a freak rate
  // is a story, not a relationship, so it never leads the sentence.
  const bestRate = useMemo(() => {
    const eligible = bookRows.filter((r) => r.loads >= 2 && r.medianRpm != null);
    return eligible.length
      ? eligible.reduce((b, r) =>
          (r.medianRpm as number) > (b.medianRpm as number) ? r : b,
        )
      : null;
  }, [bookRows]);

  const noBook = shape.desks === 0;
  const BAR = [
    { k: "once", b: shape.once, fill: "var(--color-plate-a)" },
    { k: "twice", b: shape.twice, fill: "var(--color-amber)" },
    { k: "repeat", b: shape.repeat, fill: "var(--color-status-positive-text)" },
  ] as const;

  return (
    <div className="flex flex-col gap-3">
      {/* the board's own window — one clock for the whole tab */}
      <div className="flex items-center justify-end" data-testid="agents-window">
        <SegmentedTabs
          size="sm"
          ariaLabel="Agents window"
          tabs={AGENCY_WINDOWS.map((w) => ({ value: w, label: WINDOW_LABEL[w] }))}
          value={win}
          onChange={setWin}
        />
      </div>

      {/* the answering line */}
      <Panel className="p-4" data-testid="answering-line">
        <div className="flex items-baseline gap-3 flex-wrap font-condensed text-[14px] text-dim">
          <span className="font-condensed font-semibold text-[21px] tabular-nums text-ink">
            {shape.desks} DESK{shape.desks === 1 ? "" : "S"}
          </span>
          <span>
            {shape.repeatDesks > 0 && (
              <>
                ·{" "}
                <b className="font-semibold text-ink">{shape.repeatDesks}</b> gave
                you repeat freight
              </>
            )}
            {shape.gross > 0 && (
              <>
                {" "}
                · <b className="font-semibold text-ink">{money(shape.gross)}</b>{" "}
                booked through them
              </>
            )}
            {bestRate && (
              <>
                {" "}
                · best rate{" "}
                <b className="font-semibold text-status-positive-text">
                  {name(bestRate)} {fmtRpm(bestRate.medianRpm)}/mi
                </b>{" "}
                ({plural(bestRate.loads, "load")}
                {bestRate.daysSince != null && bestRate.daysSince >= QUIET_DAYS
                  ? `, quiet ${bestRate.daysSince} days`
                  : ""}
                )
              </>
            )}
            {shape.once.desks > 0 && (
              <>
                {" "}
                ·{" "}
                <b className="font-semibold text-amber-hi">
                  {shape.once.desks} ran once
                </b>
              </>
            )}
          </span>
        </div>
      </Panel>

      {/* the leaderboard — the spine, unchanged but for its window */}
      <Leaderboard
        board={board}
        ladder={ladder}
        now={now}
        contactsFailed={contactsFailed}
        failed={failed}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* ------------------------------- where the book comes from */}
        <Panel className="p-4 min-w-0" data-testid="book-shape">
          <h3 className="ds2-label flex justify-between">
            Where the book actually comes from
            <span className="normal-case tracking-normal font-normal text-faint">
              {plural(shape.desks, "desk")} · {board.rangeLabel.toLowerCase()}
            </span>
          </h3>
          {noBook ? (
            <p className="text-xs text-faint py-4">
              No delivered loads in this window.
            </p>
          ) : (
            <>
              <div className="flex gap-[2px] h-6 rounded-md overflow-hidden my-2.5 bg-canvas">
                {BAR.filter((s) => s.b.gross > 0).map((s) => (
                  <div
                    key={s.k}
                    style={{ width: `${s.b.share * 100}%`, background: s.fill }}
                    title={`${plural(s.b.desks, "desk")} · ${money(s.b.gross)}`}
                  />
                ))}
              </div>
              <table className="w-full text-[12px]">
                <tbody>
                  {BAR.map((s) => (
                    <tr key={s.k} className="border-b ds2-cell-rule last:border-b-0">
                      <td className="py-[6px] text-ink">
                        <span
                          className="inline-block w-2 h-2 rounded-sm mr-1.5 align-[0px]"
                          style={{ background: s.fill }}
                        />
                        {s.k === "once"
                          ? "ran once"
                          : s.k === "twice"
                            ? "ran twice"
                            : "three or more"}
                      </td>
                      <td className={TD_NUM}>{plural(s.b.desks, "desk")}</td>
                      <td className={TD_NUM}>{money(s.b.gross)}</td>
                      <td
                        className={`${TD_NUM} ${
                          s.k === "once"
                            ? "text-status-negative-text"
                            : s.k === "repeat"
                              ? "text-status-positive-text"
                              : "text-ink"
                        }`}
                      >
                        {Math.round(s.b.share * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11.5px] text-faint mt-2">
                {shape.once.desks > 0 ? (
                  <>
                    {Math.round(shape.once.share * 100)}% of the money came from
                    desks you used exactly once.{" "}
                  </>
                ) : null}
                {plural(shape.repeatDesks, "desk")} gave you repeat freight — the
                relationships worth keeping warm ·{" "}
                <Link to="/agents" className="text-amber-hi">
                  the roster on Agents ›
                </Link>
              </p>
            </>
          )}
        </Panel>

        {/* ------------------------------------- gone quiet */}
        <Panel className="p-4 min-w-0" data-testid="gone-quiet">
          <h3 className="ds2-label flex justify-between">
            Gone quiet — worth a call
            <span className="normal-case tracking-normal font-normal text-faint">
              repeat desks only · by money at risk
            </span>
          </h3>
          {quiet.length === 0 ? (
            <p className="text-xs text-faint py-4">
              {shape.repeatDesks === 0
                ? "No desk has given you more than one load in this window yet."
                : `Every desk that came back has run inside ${QUIET_DAYS} days.`}
            </p>
          ) : (
            <>
              <table className="w-full text-[12px] mt-2">
                <thead>
                  <tr className="border-b ds2-cell-rule">
                    <th className={`${TH} text-left`}>Agent</th>
                    <th className={`${TH} text-right`}>Loads</th>
                    <th className={`${TH} text-right`}>$/mi</th>
                    <th className={`${TH} text-right`}>Booked</th>
                    <th className={`${TH} text-right`}>Quiet</th>
                  </tr>
                </thead>
                <tbody>
                  {quiet.slice(0, QUIET_SHOWN).map((r) => (
                    <tr key={r.agentId} className="border-b ds2-cell-rule last:border-b-0">
                      <td className="py-[6px] text-ink truncate">
                        <Link to={`/agents/${r.agentId}`} className="hover:underline">
                          {name(r)}
                        </Link>
                        {code(r) && (
                          <span className="text-faint font-normal"> {code(r)}</span>
                        )}
                      </td>
                      <td className={TD_NUM}>{r.loads}</td>
                      <td className={TD_NUM}>{fmtRpm(r.medianRpm)}</td>
                      <td className={TD_NUM}>{money(r.gross)}</td>
                      <td className={`${TD_NUM} ${quietTone(r.daysSince)}`}>
                        {r.daysSince == null ? "—" : `${r.daysSince} d`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11.5px] text-faint mt-2">
                Repeat desks with no freight in {QUIET_DAYS} days. A one-load desk
                is a stranger, not a lapsed relationship, so it is not listed ·
                who to call from where you drop →{" "}
                <Link to="/foreman" className="text-amber-hi">
                  the Foreman ›
                </Link>
              </p>
            </>
          )}
        </Panel>
      </div>

      {/* --------------------------------------- running with lately */}
      <Panel className="p-4" data-testid="working-with">
        <h3 className="ds2-label flex justify-between">
          Running with lately
          <span className="normal-case tracking-normal font-normal text-faint">
            {board.rangeLabel.toLowerCase()} · newest first
          </span>
        </h3>
        {recent.length === 0 ? (
          <p className="text-xs text-faint py-4">No delivered loads in this window.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-0.5 mt-1.5">
              {recent.map((r) => (
                <Link
                  key={r.agentId}
                  to={`/agents/${r.agentId}`}
                  className="flex items-center justify-between gap-2 py-[5px] text-[12px] border-b ds2-cell-rule"
                >
                  <span className="truncate text-ink">{name(r)}</span>
                  <span className="whitespace-nowrap font-condensed font-semibold tabular-nums text-dim">
                    <span className={quietTone(r.daysSince)}>
                      {r.daysSince == null ? "—" : `${r.daysSince} d`}
                    </span>{" "}
                    · <b className="text-ink">{money(r.gross)}</b>
                  </span>
                </Link>
              ))}
            </div>
            <p className="text-[11.5px] text-faint mt-2">
              {plural(shape.desks, "desk")} worked in the window ·{" "}
              {money(shape.gross)} between them
            </p>
          </>
        )}
      </Panel>
    </div>
  );
};
