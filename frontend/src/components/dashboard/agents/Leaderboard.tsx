import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import {
  FREIGHT_CLASSES,
  sortBy,
  type DeskRow,
  type Leaderboard as LeaderboardData,
  type SortKey,
} from "@/lib/metrics/leaderboard";
import { ESTABLISHED_AT } from "@/lib/relationships/tierSuggestion";
import { formatDate, money, rpm } from "@/lib/format";
import { shortDate, utcDayKey } from "@/lib/relationships/dayKeys";
import { Panel } from "@/components/ui/Panel";
import { FetchFailed } from "@/components/integrity/FetchFailed";
import { GRADE_META } from "@/components/agents/gradeMeta";
import { nameOf } from "@/lib/relationships/nameOf";

// THE LEADERBOARD — the book ranked by desk, one rate (the Tiers rate over 12
// months, at the desk), one gate (three delivered loads), the booking ladder's
// words. Not a race: no medals, no podium. A desk under three loads is shown,
// never graded.

const pct = (n: number | null): string => (n == null ? "—" : `${Math.round(n * 100)}%`);

const RateText = ({ r }: { r: DeskRow }) =>
  r.allInRpm == null ? (
    <span className="text-muted-text">no miles logged</span>
  ) : (
    <>
      {rpm(r.allInRpm)}
      {r.partialRpm ? "*" : ""}
    </>
  );

const GradeWord = ({ r }: { r: DeskRow }) => {
  if (!r.grade) return <span className="text-muted-text">—</span>;
  const m = GRADE_META[r.grade];
  return (
    <span
      className="inline-flex items-center h-[17px] px-[5px] rounded font-condensed font-bold text-[9.5px] tracking-[.06em] whitespace-nowrap"
      style={{ color: m.fg, background: m.bg }}
    >
      {r.gradeWord}
    </span>
  );
};

const detentionText = (r: DeskRow): string => {
  const n = r.detention.owed + r.detention.paid;
  return n === 0 ? "—" : `${r.detention.paid} of ${n} paid`;
};

const lastText = (r: DeskRow): string => shortDate(r.lastLoad) ?? "—";

const COLS: { key: SortKey; label: string }[] = [
  { key: "loads", label: "Loads" },
  { key: "gross", label: "Gross" },
  { key: "share", label: "Share" },
  { key: "rate", label: "$ / driven mi" },
];

const Th = ({
  label,
  sort,
  col,
  onSort,
  right,
}: {
  label: string;
  sort: SortKey;
  col: SortKey;
  onSort: (k: SortKey) => void;
  right?: boolean;
}) => (
  <th scope="col" className={`px-2 py-1.5 font-normal ${right ? "text-right" : "text-left"}`} aria-sort={sort === col ? "descending" : "none"}>
    <button
      type="button"
      onClick={() => onSort(col)}
      className={`ds2-label ${sort === col ? "text-light" : ""} hover:text-light`}
    >
      {label}
      {sort === col ? " ↓" : ""}
    </button>
  </th>
);

const PlainTh = ({ children, right }: { children: string; right?: boolean }) => (
  <th scope="col" className={`px-2 py-1.5 font-normal ds2-label ${right ? "text-right" : "text-left"}`}>
    {children}
  </th>
);

const People = ({ r, contactsFailed, now }: { r: DeskRow; contactsFailed: boolean; now: Date }) => (
  <div className="pl-6 pr-2 py-2 grid gap-1">
    {r.peopleRows.length === 0 && <p className="text-[11px] text-muted-text">No one is on file at this desk.</p>}
    {r.peopleRows.map((p) => (
      <div key={p.agent.agent_id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px]">
        <Link to={`/agents/${p.agent.agent_id}`} className="text-light hover:underline">
          {nameOf(p.agent)}
        </Link>
        <span className="text-muted-text">{p.postingCode?.code ?? "no code"}</span>
        <span className="text-muted-text tabular-nums">{p.delivered} lifetime loads</span>
        <span className="text-muted-text tabular-nums">
          {p.allInRpm == null ? "no miles logged" : `${rpm(p.allInRpm)}${p.partialRpm ? "*" : ""} all-in`}
        </span>
        <span className="text-muted-text">
          {contactsFailed
            ? "contact log didn't load"
            : p.lastContact
              ? `last contact ${formatDate(p.lastContact)}`
              : "never contacted"}
        </span>
      </div>
    ))}
    <p className="text-[10.5px] text-faint">
      {ESTABLISHED_AT} delivered loads (lifetime, all people) grade a desk · {r.lifetime} so far · as of {formatDate(utcDayKey(now))}
    </p>
  </div>
);

interface ItemProps {
  r: DeskRow;
  isOpen: boolean;
  toggle: (k: string) => void;
  contactsFailed: boolean;
  now: Date;
}

const Row = ({ r, n, isOpen, toggle, contactsFailed, now }: ItemProps & { n: number | null }) => {
  return (
    <Fragment>
      <tr className="border-t ds2-cell-rule">
        <td className="px-2 py-1.5 text-muted-text tabular-nums">{n ?? "—"}</td>
        <td className="px-2 py-1.5">
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => toggle(r.key)}
            className="flex items-start gap-1 text-left"
          >
            <ChevronRight size={13} className={`mt-[3px] flex-none transition-transform ${isOpen ? "rotate-90" : ""}`} />
            <span>
              <span className="block text-ink font-semibold text-[12.5px]">{r.name}</span>
              <span className="block text-[10.5px] text-muted-text">
                {r.codes.join(" · ")}
                {r.people ? ` · ${r.people}` : ""}
              </span>
            </span>
          </button>
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{r.loads}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{money(r.gross)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{pct(r.share)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums text-ink font-semibold">
          <RateText r={r} />
        </td>
        <td className="px-2 py-1.5">
          <GradeWord r={r} />
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{r.perDay == null ? "—" : money(r.perDay)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{pct(r.loadedShare)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{detentionText(r)}</td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap">{lastText(r)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{r.rating ?? "—"}</td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={12}>
            <People r={r} contactsFailed={contactsFailed} now={now} />
          </td>
        </tr>
      )}
    </Fragment>
  );
};

const Card = ({ r, isOpen, toggle, contactsFailed, now }: ItemProps) => {
  return (
    <div className="border-t ds2-cell-rule py-2 first:border-t-0">
      <button type="button" aria-expanded={isOpen} onClick={() => toggle(r.key)} className="w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="text-ink font-semibold text-[13px] truncate">{r.name}</span>
          <GradeWord r={r} />
        </div>
        <div className="text-[10.5px] text-muted-text">
          {r.codes.join(" · ")}
          {r.people ? ` · ${r.people}` : ""}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-[11.5px] tabular-nums text-light">
          <span>
            {r.loads} loads · {money(r.gross)} · {pct(r.share)}
          </span>
          <span className="font-semibold">
            <RateText r={r} />
          </span>
          <span>{r.perDay == null ? "—" : `${money(r.perDay)}/day`}</span>
          <span className="text-muted-text">last load {lastText(r)}</span>
        </div>
      </button>
      {isOpen && <People r={r} contactsFailed={contactsFailed} now={now} />}
    </div>
  );
};


export interface LeaderboardProps {
  board: LeaderboardData;
  ladder: RateLadder | null;
  now: Date;
  contactsFailed: boolean;
  // A failed agencies/agents fetch — the table is replaced, never drawn empty.
  failed: { onRetry: () => void } | null;
}

export const Leaderboard = ({ board, ladder, now, contactsFailed, failed }: LeaderboardProps) => {
  const [sort, setSort] = useState<SortKey>("rate");
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const toggle = (k: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const item = (r: DeskRow): ItemProps => ({ r, isOpen: open.has(r.key), toggle, contactsFailed, now });

  const graded = sortBy(board.rows.filter((r) => r.graded), sort);
  const ungradedAll = sortBy(board.rows.filter((r) => !r.graded), sort);
  const singles = ungradedAll.filter((r) => r.loads === 1);
  const ungraded = showAll ? ungradedAll : ungradedAll.filter((r) => r.loads !== 1);

  const ladderText =
    ladder && ladder.walkAway != null
      ? `walk-away ${rpm(ladder.walkAway)} · target ${rpm(ladder.target)} · strong ${rpm(ladder.strong)}`
      : "not built yet — desks show a rate, not a grade";

  const bestLine = (
    <p className="text-[11.5px] text-muted-text mt-3">
      Best desk by freight class (graded desks):{" "}
      {FREIGHT_CLASSES.map((cls, i) => {
        const b = board.best[cls];
        return (
          <span key={cls}>
            {i > 0 ? " · " : ""}
            {b ? (
              <>
                <span className="text-light">{cls}</span> · {b.desk.name}{" "}
                <span className="text-light tabular-nums">{rpm(b.rpm)}</span>
              </>
            ) : (
              `no desk has three ${cls} loads yet`
            )}
          </span>
        );
      })}
    </p>
  );

  return (
    <Panel className="p-4">
      <h3 className="ds2-label">The leaderboard</h3>
      <p className="text-[11px] text-faint mb-2.5">
        by desk · 12 months to {formatDate(utcDayKey(now))} · tap a column to sort · ladder: {ladderText}
      </p>

      {failed ? (
        <FetchFailed what="the agents and agencies" onRetry={failed.onRetry} />
      ) : board.rows.length === 0 ? (
        <p className="text-xs text-muted-text">No desk has a delivered load in the last 12 months.</p>
      ) : (
        <>
          {/* desktop — the table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr>
                  <PlainTh>#</PlainTh>
                  <PlainTh>Desk</PlainTh>
                  {COLS.map((c) => (
                    <Th key={c.key} label={c.label} sort={sort} col={c.key} onSort={setSort} right />
                  ))}
                  <PlainTh>Grade</PlainTh>
                  <Th label="$ / day" sort={sort} col="perDay" onSort={setSort} right />
                  <PlainTh right>Loaded</PlainTh>
                  <PlainTh right>Detention</PlainTh>
                  <PlainTh right>Last load</PlainTh>
                  <PlainTh right>Your rating</PlainTh>
                </tr>
              </thead>
              <tbody>
                {graded.map((r, i) => (
                  <Row key={r.key} n={i + 1} {...item(r)} />
                ))}
                {ungraded.length > 0 && (
                  <tr className="border-t ds2-cell-rule">
                    <td colSpan={12} className="px-2 py-1.5 text-[10.5px] text-faint tracking-wide uppercase">
                      Not yet graded · under {ESTABLISHED_AT} delivered loads
                    </td>
                  </tr>
                )}
                {ungraded.map((r) => (
                  <Row key={r.key} n={null} {...item(r)} />
                ))}
              </tbody>
            </table>
          </div>

          {/* phone — a card per desk */}
          <div className="md:hidden">
            {graded.map((r) => (
              <Card key={r.key} {...item(r)} />
            ))}
            {ungraded.length > 0 && (
              <p className="border-t ds2-cell-rule pt-1.5 text-[10.5px] text-faint tracking-wide uppercase">
                Not yet graded · under {ESTABLISHED_AT} delivered loads
              </p>
            )}
            {ungraded.map((r) => (
              <Card key={r.key} {...item(r)} />
            ))}
          </div>

          {singles.length > 0 && (
            <p className="text-[11.5px] text-muted-text mt-2">
              {showAll ? "" : `+ ${singles.length} desk${singles.length === 1 ? "" : "s"} with one load this year `}
              <button type="button" className="underline-offset-2 hover:underline text-light" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "show fewer" : "show all"}
              </button>
            </p>
          )}
          {board.unattributed.loads > 0 && (
            <p className="text-[11.5px] text-muted-text mt-1">
              {board.unattributed.loads} unattributed load{board.unattributed.loads === 1 ? "" : "s"} · {money(board.unattributed.gross)}
            </p>
          )}
          {bestLine}
        </>
      )}
    </Panel>
  );
};
