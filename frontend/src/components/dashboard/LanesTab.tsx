import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import { type RateTargets } from "@/lib/metrics/rateTargets";
import {
  LEDGER_WINDOWS,
  DEFAULT_WINDOW,
  RELOAD_NEAR_MILES,
  RELOAD_FAR_MILES,
  buildLedger,
  ledgerHeadline,
  reloadSummary,
  repeatLanes,
  windowLoads,
  type LedgerWindow,
} from "@/lib/metrics/marketLedger";
import { gradeCostsOf, type MarketGrade } from "@/lib/metrics/marketFactor";
import {
  areaMapDataOf,
  getLoadTypeMix,
  MIN_KPI_LOADS,
} from "@/lib/metrics/lanes";
import { AnsweringLine } from "@/components/lanes/AnsweringLine";
import { GradeChip } from "@/components/lanes/MarketLedger";
import { LanesMapThumb } from "@/components/lanes/LanesMapThumb";
import { Panel } from "@/components/ui/Panel";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { money, rpm as fmtRpm } from "@/lib/format";

// The GLANCE before the board (the Redesign, phase C, 2 of 4). Jason's freight
// repeats by MARKET, not by lane — 75 loads over 69 distinct lanes, four of
// them run twice, but Charlotte loaded seven times. So every row here is a
// market, read off the Lanes page's own engine at its new market grain and on
// the page's own window, which means every figure is checkable on the board one
// click away. The 30/60/90 toggle, the four one-market doors and Top-lanes-by-
// gross came off: on this volume they showed single loads dressed as trends.
const ROWS_SHOWN = 7;
const LANES_SHOWN = 6;

// Oversize is his specialty — it always wears amber; the rest follow the
// validated fixed-order categorical set. "Other" is a neutral bucket.
const MIX_VARS = ["var(--color-cat2)", "var(--color-cat3)", "var(--color-cat5)", "var(--color-cat4)"];
const mixColor = (type: string, i: number) =>
  /over/i.test(type) ? "var(--color-cat1)" : MIX_VARS[i % MIX_VARS.length];

// The window said the way a sentence needs it, not the way the toggle labels it.
const WINDOW_PHRASE: Record<LedgerWindow, string> = {
  "12m": "the trailing twelve months",
  ytd: "this year",
  all: "all time",
};

// A figure takes its tone from the ledger's own grade, so the colour and the
// chip beside it can never disagree. `fair` and `thin` stay plain ink.
const gradeTone = (grade: MarketGrade): string =>
  grade === "strong"
    ? "text-status-positive-text"
    : grade === "soft"
      ? "text-status-negative-text"
      : "text-ink";

const miles = (n: number): string => Math.round(n).toLocaleString("en-US");
const plural = (n: number, word: string): string =>
  `${n} ${word}${n === 1 ? "" : "s"}`;

const TH = "ds2-label pb-1.5 font-normal";
const TD_NUM = "py-[6px] font-condensed font-semibold tabular-nums text-right";

export const LanesTab = ({
  loads,
  trips,
  targets,
}: {
  loads: Load[];
  trips: Trip[];
  targets: RateTargets; // the one basis — the grades are read against YOUR cost
}) => {
  // One clock per mount, like LanesPage: a window boundary must not move
  // under the figures while the tab is open.
  const [now] = useState(() => new Date());
  const [win, setWin] = useState<LedgerWindow>(DEFAULT_WINDOW);

  const costs = useMemo(() => gradeCostsOf(targets), [targets]);
  const scoped = useMemo(() => windowLoads(loads, win, now), [loads, win, now]);
  const rows = useMemo(
    () => buildLedger(loads, win, now, "market", trips, costs),
    [loads, win, now, trips, costs],
  );
  const head = useMemo(() => ledgerHeadline(rows, scoped, "market"), [rows, scoped]);
  const reload = useMemo(
    () => reloadSummary(loads, win, now, trips),
    [loads, win, now, trips],
  );
  const lanes = useMemo(() => repeatLanes(loads, win, now), [loads, win, now]);
  const mix = useMemo(() => getLoadTypeMix(scoped), [scoped]);
  // The thumbnail rides the LEDGER'S window, not a window of its own, so the
  // picture and the two lists beside it describe the same loads.
  const thumb = useMemo(() => areaMapDataOf(scoped, "state"), [scoped]);

  // Most-used first on the OUT side; on the IN side the markets you land in
  // most, then the cheapest reload first — nulls last, never sorted as 0.
  const outRows = useMemo(
    () =>
      rows
        .filter((r) => r.out.loads >= MIN_KPI_LOADS)
        .sort((a, b) => b.out.loads - a.out.loads || b.out.gross - a.out.gross)
        .slice(0, ROWS_SHOWN),
    [rows],
  );
  const inRows = useMemo(
    () =>
      rows
        .filter((r) => r.in.deliveries >= MIN_KPI_LOADS)
        .sort(
          (a, b) =>
            b.in.deliveries - a.in.deliveries ||
            (a.in.reloadMilesMedian ?? Infinity) -
              (b.in.reloadMilesMedian ?? Infinity),
        )
        .slice(0, ROWS_SHOWN),
    [rows],
  );

  const emptyPct =
    head.emptyShare == null ? null : Math.round(head.emptyShare * 100);
  const mixTotal = mix.reduce((s, m) => s + m.gross, 0);
  const mixShown = mix.slice(0, 4);
  const mixOther = mix.slice(4).reduce((s, m) => s + m.gross, 0);
  const noFreight = scoped.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {/* the board's own window — one clock for the tab and the page */}
      <div className="flex items-center justify-end" data-testid="lanes-window">
        <SegmentedTabs
          size="sm"
          ariaLabel="Lanes window"
          tabs={LEDGER_WINDOWS.map((w) => ({ value: w.value, label: w.label }))}
          value={win}
          onChange={setWin}
        />
      </div>

      <Panel className="p-4" data-testid="answering-line">
        <AnsweringLine head={head} areaWord="market" />
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* ---------------------------------------- where you load (OUT) */}
        <Panel className="p-4 min-w-0" data-testid="out-list">
          <h3 className="ds2-label flex justify-between">
            Where you load · the OUT half
            <span className="normal-case tracking-normal font-normal text-faint">
              what loading there paid you
            </span>
          </h3>
          {noFreight ? (
            <p className="text-xs text-faint py-4">No delivered loads in this window.</p>
          ) : outRows.length === 0 ? (
            <p className="text-xs text-faint py-4">
              No market has three loads in this window yet ·{" "}
              <Link to="/lanes" className="text-amber-hi">
                the full ledger on Lanes ›
              </Link>
            </p>
          ) : (
            <>
              <table className="w-full text-[13px] mt-2">
                <thead>
                  <tr className="border-b ds2-cell-rule">
                    <th className={`${TH} text-left`}>Market</th>
                    <th className={`${TH} text-right`}>Loads</th>
                    <th className={`${TH} text-right`}>Typical $/mi</th>
                    <th className={`${TH} text-right`}>Gross</th>
                    <th className={`${TH} text-center`}>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {outRows.map((r) => (
                    <tr key={r.state} className="border-b ds2-cell-rule last:border-b-0">
                      <td className="py-[6px] text-ink">
                        {r.state}
                        {r.abbr && (
                          <span className="text-faint font-normal"> {r.abbr}</span>
                        )}
                      </td>
                      <td className={TD_NUM}>{r.out.loads}</td>
                      <td className={`${TD_NUM} ${gradeTone(r.out.grade)}`}>
                        {fmtRpm(r.out.typicalRpm)}
                      </td>
                      <td className={TD_NUM}>{money(r.out.gross)}</td>
                      <td className="py-[6px] text-center">
                        <GradeChip grade={r.out.grade} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[12.5px] text-faint mt-2">
                {plural(head.originStates, "market")} loaded in · the{" "}
                {outRows.length} with three or more loads · the grade is the
                ledger&rsquo;s own (the Scorer&rsquo;s four words on $/day
                ex-fuel) ·{" "}
                <Link to="/lanes" className="text-amber-hi">
                  the full ledger on Lanes ›
                </Link>
              </p>
            </>
          )}
        </Panel>

        {/* ------------------------------------- where you deliver (IN) */}
        <Panel className="p-4 min-w-0" data-testid="in-list">
          <h3 className="ds2-label flex justify-between">
            Where you deliver · the IN half
            <span className="normal-case tracking-normal font-normal text-faint">
              what getting empty there cost you
            </span>
          </h3>
          {noFreight ? (
            <p className="text-xs text-faint py-4">No delivered loads in this window.</p>
          ) : inRows.length === 0 ? (
            <p className="text-xs text-faint py-4">
              No market has three deliveries in this window yet ·{" "}
              <Link to="/lanes" className="text-amber-hi">
                the full ledger on Lanes ›
              </Link>
            </p>
          ) : (
            <>
              <table className="w-full text-[13px] mt-2">
                <thead>
                  <tr className="border-b ds2-cell-rule">
                    <th className={`${TH} text-left`}>Market</th>
                    <th className={`${TH} text-right`}>Deliveries</th>
                    <th className={`${TH} text-right`}>Reload · median</th>
                    <th className={`${TH} text-right`}>
                      Within {RELOAD_NEAR_MILES} mi
                    </th>
                    <th className={`${TH} text-center`}>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {inRows.map((r) => (
                    <tr key={r.state} className="border-b ds2-cell-rule last:border-b-0">
                      <td className="py-[6px] text-ink">
                        {r.state}
                        {r.abbr && (
                          <span className="text-faint font-normal"> {r.abbr}</span>
                        )}
                      </td>
                      <td className={TD_NUM}>{r.in.deliveries}</td>
                      <td className={`${TD_NUM} ${gradeTone(r.in.grade)}`}>
                        {r.in.reloadMilesMedian == null
                          ? "—"
                          : `${miles(r.in.reloadMilesMedian)} mi`}
                      </td>
                      {/* of RELOADS, never of deliveries: a delivery nobody
                          logged a reload for is not a free reload */}
                      <td className={TD_NUM}>
                        {r.in.reloads === 0
                          ? "—"
                          : `${r.in.within} of ${r.in.reloads}`}
                      </td>
                      <td className="py-[6px] text-center">
                        <GradeChip grade={r.in.grade} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[12.5px] text-faint mt-2">
                {plural(head.deliveryStates, "market")} delivered into · the{" "}
                {inRows.length} with three or more · the grade is the
                ledger&rsquo;s IN grade (the reload as a share of the next
                load) · who to call from here →{" "}
                <Link to="/foreman" className="text-amber-hi">
                  the Foreman ›
                </Link>
              </p>
            </>
          )}
        </Panel>
      </div>

      {/* --------------------------------------------- the reload line */}
      <Panel className="p-4" data-testid="reload-line">
        <h3 className="ds2-label mb-1.5">
          Getting empty · {WINDOW_PHRASE[win]}
        </h3>
        {reload.reloads === 0 ? (
          <p className="font-condensed text-[14.5px] text-dim">
            No reloads logged in this window.
          </p>
        ) : (
          <p className="font-condensed text-[14.5px] text-dim">
            <b className="font-semibold text-ink text-[21.5px] tabular-nums">
              {reload.reloads}
            </b>{" "}
            {reload.reloads === 1 ? "reload" : "reloads"}
            {reload.medianMiles != null && (
              <>
                {" "}
                · median{" "}
                <b className="font-semibold text-ink tabular-nums">
                  {miles(reload.medianMiles)}
                </b>{" "}
                empty miles to the next pickup
              </>
            )}{" "}
            ·{" "}
            <b className="font-semibold text-status-positive-text tabular-nums">
              {reload.within}
            </b>{" "}
            within {RELOAD_NEAR_MILES} mi ·{" "}
            <b className="font-semibold text-ink tabular-nums">
              {reload.between}
            </b>{" "}
            within {RELOAD_FAR_MILES} ·{" "}
            <b className="font-semibold text-status-negative-text tabular-nums">
              {reload.beyond}
            </b>{" "}
            beyond ·{" "}
            <b className="font-semibold text-ink tabular-nums">
              {miles(reload.emptyMiles)}
            </b>{" "}
            empty miles
            {emptyPct != null && <>, {emptyPct}% of the miles you drove</>}
            {reload.home > 0 && (
              <>
                {" "}
                · {plural(reload.home, "gap")} of a week or more{" "}
                {reload.home === 1 ? "was" : "were"} home time, kept out of
                every average
              </>
            )}
            {reload.unlogged > 0 && (
              <> · {plural(reload.unlogged, "reload")} not logged</>
            )}
          </p>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-3">
        {/* the one door: a picture, zero interactions (Jason's option C) */}
        <Link
          to="/lanes"
          className="ds2-board p-4 block hover:border-amber/40 transition-colors"
          data-testid="map-door"
        >
          <h3 className="ds2-label flex justify-between">
            Where the freight lives
            <span className="normal-case tracking-normal font-normal text-faint">
              thumbnail — the board lives on Lanes
            </span>
          </h3>
          <div className="mt-2.5">
            <LanesMapThumb data={thumb} />
          </div>
          <span className="inline-flex mt-2 font-condensed font-semibold text-[13.5px] text-amber-hi tracking-[.05em]">
            Open the situation board →
          </span>
        </Link>

        <div className="flex flex-col gap-3 min-w-0">
          {/* ------------------------------------------ repeat lanes */}
          <Panel className="p-4 min-w-0" data-testid="repeat-lanes">
            <h3 className="ds2-label flex justify-between">
              Repeat lanes
              <span className="normal-case tracking-normal font-normal text-faint">
                ran more than once · typical $/loaded mi
              </span>
            </h3>
            {lanes.rows.length === 0 ? (
              <p className="text-xs text-faint py-4">
                No lane has run twice in this window ·{" "}
                {plural(lanes.singles, "lane")} ran once
              </p>
            ) : (
              <>
                <div className="flex flex-col mt-1.5">
                  {lanes.rows.slice(0, LANES_SHOWN).map((l) => (
                    <div
                      key={l.lane}
                      className="flex items-center justify-between gap-2 py-[6px] text-[13px] border-b ds2-cell-rule last:border-b-0"
                    >
                      <span className="truncate text-ink" title={l.lane}>
                        {l.lane}
                      </span>
                      <span className="whitespace-nowrap font-condensed font-semibold tabular-nums text-dim">
                        {l.loads} · <b className="text-ink">{money(l.gross)}</b>{" "}
                        · {fmtRpm(l.typicalRpm)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[12.5px] text-faint mt-2">
                  {plural(lanes.singles, "lane")} ran once ·{" "}
                  <Link to="/lanes" className="text-amber-hi">
                    all of them on the Lanes page ›
                  </Link>
                </p>
              </>
            )}
          </Panel>

          {/* ------------------------------------------- load-type mix */}
          <Panel className="p-4 min-w-0" data-testid="mix">
            <h3 className="ds2-label mb-2 flex justify-between">
              Load-type mix
              <span className="normal-case tracking-normal font-normal text-faint">
                {money(mixTotal)} gross · share · typical $/loaded mi
              </span>
            </h3>
            {mix.length === 0 ? (
              <p className="text-xs text-faint">No delivered loads in this window.</p>
            ) : (
              <>
                <div className="flex gap-[2px] h-6 rounded-md overflow-hidden mb-2 bg-canvas">
                  {mixShown.map((m, i) => (
                    <div
                      key={m.type}
                      style={{
                        width: `${(m.gross / (mixTotal || 1)) * 100}%`,
                        background: mixColor(m.type, i),
                      }}
                      title={`${m.type} ${money(m.gross)}`}
                    />
                  ))}
                  {mixOther > 0 && (
                    <div
                      style={{
                        width: `${(mixOther / (mixTotal || 1)) * 100}%`,
                        background: "var(--color-plate-a)",
                      }}
                      title={`Other ${money(mixOther)}`}
                    />
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  {mixShown.map((m, i) => (
                    <div
                      key={m.type}
                      className="flex items-center justify-between gap-2 text-[12.5px] text-dim"
                    >
                      <span className="truncate flex items-center gap-1.5">
                        <span
                          className="inline-block w-2 h-2 rounded-sm shrink-0"
                          style={{ background: mixColor(m.type, i) }}
                        />
                        {m.type} · {m.loadCount}
                      </span>
                      <span className="whitespace-nowrap font-condensed font-semibold text-ink tabular-nums">
                        {Math.round(m.share * 100)}% · {fmtRpm(m.typicalRpm)}
                      </span>
                    </div>
                  ))}
                  {mixOther > 0 && (
                    <div className="flex items-center justify-between gap-2 text-[12.5px] text-dim">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2 h-2 rounded-sm shrink-0"
                          style={{ background: "var(--color-plate-a)" }}
                        />
                        Other
                      </span>
                      {/* a folded bucket of mixed types has no one rate */}
                      <span className="whitespace-nowrap font-condensed font-semibold text-ink tabular-nums">
                        {Math.round((mixOther / (mixTotal || 1)) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
};
