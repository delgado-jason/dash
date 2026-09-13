import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Agent } from "@/types/agent";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { BoardCell } from "@/components/ui/Board";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { ForgedPlate, Well } from "@/components/ui/ForgedPlate";
import { money, rpm as fmtRpm } from "@/lib/format";
import { copyText } from "@/lib/clipboard";
import { SYSTEM_START } from "@/lib/metrics/relationships";
import { INBOUND_HEADLINE_MIN, inboundHeadline } from "@/lib/relationships/inboundHeadline";
import { shortDate, weekdayShort } from "@/lib/relationships/dayKeys";
import { nameOf } from "@/lib/relationships/nameOf";
import { contactTypeLabel } from "@/lib/relationships/contactTypes";
import { methodFor } from "@/lib/relationships/todayQueue";
import { milestoneMarker } from "@/lib/relationships/milestones";
import {
  bucketWord,
  buildReviewModel,
  monthWord,
  reviewPeriod,
  reviewReportText,
  tierWord,
  type MonthsSigned,
  type QuarterModel,
  type ReviewModel,
  type ReviewPeriod,
  type ReviewScope,
  type ScoreRow,
  type Share,
  type SuggestionRow,
  type Verdict,
} from "@/lib/relationships/review";
import { patchAgent } from "@/services/patchAgentService";
import { holdTier } from "@/services/agentTierHistoryService";
import { signRelationshipReview } from "@/services/relationshipReviewsService";
import { AgentRow, AGENT_ROW_GRID_ACTIONS, type RowChip } from "@/components/relationships/AgentRow";
import { RelSheetShell } from "@/components/relationships/RelSheetShell";
import {
  ErrorLine,
  FieldLabel,
  GhostButton,
  PrimaryButton,
  SectionHead,
} from "@/components/relationships/primitives";
import type { TouchPrefill } from "@/components/relationships/LogTouchForm";
import { useRelationships } from "./context";

// REVIEW (REL-01 v2.0 §5H) — the month the owner signs. Every board below is
// read from lib/relationships/review; this file only draws them and writes what
// the owner taps. The doctrine on the page: dash suggests, the OWNER approves
// with a written reason, cooling is monitoring rather than a to-do, and the
// dispatcher sees all of it read-only.

const SCOPE_TABS: { value: ReviewScope; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const pct0 = (n: number | null): string => (n == null ? "—" : `${Math.round(n * 100)}%`);
const fractionWord = (s: Share): string => `${s.inbound} of ${s.attributed}`;
// A share cell reads "—" when nothing is attributed: no bar is ever drawn at 0%
// for "we have no evidence".
const shareCell = (s: Share): string => (s.attributed === 0 ? "—" : fractionWord(s));

// ---- small shared furniture ----
const Chip = ({ tone, children }: { tone: "day" | "job" | "dim"; children: ReactNode }) => (
  <span
    className={`inline-flex items-center h-[22px] px-2 rounded-[5px] font-condensed font-semibold text-[11px] tracking-[.06em] uppercase ${
      tone === "day" ? "bg-well text-hot" : tone === "job" ? "bg-amber text-canvas" : "bg-dim/10 text-dim"
    }`}
  >
    {children}
  </span>
);

const Cell = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="min-w-0">
    <p className="font-condensed text-[11px] tracking-[.12em] uppercase text-faint">{label}</p>
    <p className="font-display text-[24px] leading-none mt-1 tabular-nums text-ink">{value}</p>
    {sub && <p className="text-[12px] text-dim mt-1 leading-snug">{sub}</p>}
  </div>
);

// The md+ column words, on the row grid so they sit over their cells.
const RowHeader = ({ cols }: { cols: [string, string, string, string] }) => (
  <div className={`hidden md:grid items-center gap-3 px-3.5 py-1.5 ${AGENT_ROW_GRID_ACTIONS} font-condensed text-[10.5px] tracking-[.12em] uppercase text-faint`}>
    <span>{cols[0]}</span>
    <span className="text-right">{cols[1]}</span>
    <span className="text-right">{cols[2]}</span>
    <span className="text-right">{cols[3]}</span>
    <span />
  </div>
);

const Panel = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`ds2-board mt-3 overflow-hidden ${className}`}>{children}</div>
);

const EmptyLine = ({ children }: { children: ReactNode }) => (
  <p className="px-3.5 pb-4 pt-1 font-condensed text-[13.5px] text-dim leading-snug">{children}</p>
);

const FootLine = ({ children }: { children: ReactNode }) => (
  <p className="flex items-start gap-2 px-3.5 py-2.5 border-t border-hairline-lo font-condensed text-[12px] text-faint leading-snug">
    {children}
  </p>
);

// A name that opens the book filtered to it — the hygiene line's doors.
const BookLink = ({ agent }: { agent: Agent }) => (
  <Link to={`/relationships/tiers?q=${encodeURIComponent(nameOf(agent))}`} className="text-amber-hi hover:text-hot">
    {nameOf(agent)}
  </Link>
);

// ---- 1. IS IT WORKING ----
// share is null for a month with nothing attributed — the line BREAKS there
// (no connectNulls): a gap is the truth, a zero would be a claim.
const InboundChart = ({ data }: { data: { month: string; share: number | null }[] }) => (
  <div className="ds2-board mt-3 p-4" style={{ height: 240 }}>
    <p className="text-xs text-faint mb-2">Inbound share by month</p>
    <ResponsiveContainer width="100%" height="88%">
      <LineChart data={data} margin={{ top: 6, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="var(--color-hairline)" strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={{ fill: "var(--color-faint)", fontSize: 11 }} />
        <YAxis domain={[0, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={{ fill: "var(--color-faint)", fontSize: 11 }} />
        <Tooltip formatter={(v) => `${Math.round(Number(v) * 100)}%`} contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-hairline)", borderRadius: 8, fontSize: 12 }} />
        <Line type="monotone" dataKey="share" stroke="#e8940a" strokeWidth={2} dot />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

const MonthTable = ({ model }: { model: ReviewModel<Agent> }) => (
  <Panel>
    <SectionHead>Month by month · since {shortDate(SYSTEM_START)}</SectionHead>
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] tabular-nums font-condensed" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr className="text-[10.5px] tracking-[.1em] uppercase text-faint">
            {["Month", "Inbound", "Tier 1", "Tier 2", "Tier 3"].map((h, i) => (
              <th key={h} className={`${i === 0 ? "text-left" : "text-right"} px-3.5 py-2 border-b border-hairline whitespace-nowrap`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.months.map((m) => (
            <tr key={m.month}>
              <td className="text-left px-3.5 py-2 border-b border-hairline-lo">{monthWord(m.month)} ’{m.month.slice(2, 4)}</td>
              <td className="text-right px-3.5 py-2 border-b border-hairline-lo text-ink">{shareCell(m.all)}</td>
              <td className="text-right px-3.5 py-2 border-b border-hairline-lo">{shareCell(m.tier1)}</td>
              <td className="text-right px-3.5 py-2 border-b border-hairline-lo">{shareCell(m.tier2)}</td>
              <td className="text-right px-3.5 py-2 border-b border-hairline-lo">{shareCell(m.tier3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Panel>
);

// ---- 2. RE-TIER SUGGESTIONS ----
// Prospect is read BEFORE the direction: a seat handed back to Prospect ranks
// below every tier, so the arrow points down — but the SOP's blue says
// "graduates on the next one", not "punished". Spec §2 and the mock agree.
const isProspectVerdict = (r: SuggestionRow<Agent>): boolean => r.suggestion === "prospect";

const verdictChip = (r: SuggestionRow<Agent>): RowChip =>
  isProspectVerdict(r)
    ? { kind: "suggest", label: r.suggestionWord }
    : r.losing
      ? { kind: "losing", label: "Losing money" }
      : r.direction === "up"
        ? { kind: "up", label: r.suggestionWord }
        : r.direction === "down"
          ? { kind: "down", label: r.suggestionWord }
          : { kind: "suggest", label: r.suggestionWord };

// The mockup's "Now → suggested" cell (md+ only). The verdict PILL rides on the
// row's own chip so the phone — where these cells are hidden — still shows it.
const NowSuggested = ({ row }: { row: SuggestionRow<Agent> }) => (
  <span className="inline-flex items-center gap-1 justify-end w-full whitespace-nowrap">
    <span className="text-dim">{bucketWord(row.bucket)}</span>
    <span className="text-faint">→</span>
    <span
      className={
        isProspectVerdict(row)
          ? "text-[#7ab0e8] font-semibold"
          : row.losing || row.direction === "down"
            ? "text-status-negative-text font-semibold"
            : row.direction === "up"
              ? "text-status-positive-text font-semibold"
              : "text-[#7ab0e8] font-semibold"
      }
    >
      {row.suggestionWord}
    </span>
  </span>
);

// ---- 5. the contact cap ----
// "{type label} {Day} — logged over the cap: '{note}'" — the override names
// itself, the day it happened (Brandie's day, not UTC's) and why.
const capOverrideWord = (t: { type: string; contacted_at: string; note?: string | null }): string => {
  const why = (t.note ?? "").trim();
  return `${contactTypeLabel(t.type)} ${weekdayShort(t.contacted_at)} — logged over the cap${why ? `: “${why}”` : " — no note"}`;
};

// ---- 9. the scorecard ----
const VERDICT_META: Record<Verdict, { label: string; tone: PillTone }> = {
  up: { label: "▲ up", tone: "good" },
  down: { label: "▼ down", tone: "bad" },
  hold: { label: "hold", tone: "neutral" },
  thin: { label: "thin — no verdict", tone: "info" },
};

const lastLoadTone = (days: number | null): string =>
  days == null ? "var(--color-faint)" : days > 60 ? "var(--color-status-negative-text)" : days > 30 ? "#f5c37a" : "var(--color-ink)";

const scoreFacts = (r: ScoreRow<Agent>): { label: string; value: string; sub?: string; tone?: string }[] => [
  { label: "Loads", value: String(r.loads) },
  { label: "Net", value: money(r.net) },
  { label: "Net $/mi", value: fmtRpm(r.netRpm), sub: r.grade ?? "no ladder" },
  { label: "Deadhead", value: pct0(r.deadheadPct) },
  { label: "Inbound", value: shareCell(r.inbound) },
  // The phone carries the same amber-over-30 / red-over-60 the table does —
  // the colour IS the fact, and it must not drop out on the small screen.
  {
    label: "Last load",
    value: r.lastLoadDays == null ? "never" : `${r.lastLoadDays}d`,
    sub: shortDate(r.lastLoad) ?? undefined,
    tone: lastLoadTone(r.lastLoadDays),
  },
  { label: "Days touched", value: String(r.outDays), sub: "out-days" },
  { label: "Inbound touches", value: String(r.inboundTouches) },
];

const ScoreExpansion = ({ row }: { row: ScoreRow<Agent> }) => (
  <div className="px-3.5 pb-3.5 -mt-1">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2.5">
      {scoreFacts(row).map((f) => (
        <div key={f.label} className="min-w-0">
          <p className="font-condensed text-[10.5px] tracking-[.12em] uppercase text-faint">{f.label}</p>
          <p className="font-condensed font-semibold text-[15px] text-ink tabular-nums" style={f.tone ? { color: f.tone } : undefined}>
            {f.value}
          </p>
          {f.sub && <p className="text-[11px] text-faint truncate">{f.sub}</p>}
        </div>
      ))}
    </div>
    <Well className="mt-2.5 px-3 py-2 flex gap-3 items-start">
      <span className="font-condensed text-[11px] tracking-[.12em] uppercase text-amber shrink-0 mt-0.5">Why</span>
      <p className="text-[13px] text-ink/90 leading-snug">{row.why}</p>
    </Well>
  </div>
);

// The name column's width and the verdict column's offset are ONE number: the
// second sticky column starts exactly where the first ends, so a long name can
// never slide under the verdict pill.
const NAME_COL_PX = 150;
const NAME_COL: CSSProperties = { width: NAME_COL_PX, maxWidth: NAME_COL_PX };
const VERDICT_COL: CSSProperties = { left: NAME_COL_PX };

const ScoreTable = ({ rows }: { rows: ScoreRow<Agent>[] }) => (
  <div className="hidden md:block overflow-x-auto">
    <table className="w-full text-[13px] tabular-nums font-condensed" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
      <thead>
        <tr className="text-[10.5px] tracking-[.1em] uppercase text-faint">
          {["Agent", "Verdict", "Loads", "Net", "Net $/mi", "Deadhead", "Inbound", "Last load", "Touched / in"].map((h, i) => (
            <th
              key={h}
              className={`${i < 2 ? "text-left" : "text-right"} px-3 py-2 border-b border-hairline whitespace-nowrap ${
                i < 2 ? "sticky left-0 bg-panel z-10" : ""
              } ${i === 0 ? "truncate" : ""}`}
              style={i === 0 ? NAME_COL : i === 1 ? VERDICT_COL : undefined}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const groupHead = i === 0 || rows[i - 1].bucket !== r.bucket;
          return (
            <Fragment key={r.agent.agent_id}>
              {groupHead && (
                <tr>
                  <td colSpan={9} className="text-left px-3 py-1.5 border-b border-hairline-lo font-display text-[13px] tracking-[.08em] text-amber-hi" style={{ background: "rgba(232,148,10,.05)" }}>
                    {bucketWord(r.bucket).toUpperCase()}
                  </td>
                </tr>
              )}
              <tr>
                <td
                  className="text-left px-3 py-2 border-b border-hairline-lo sticky left-0 bg-panel z-10 truncate"
                  style={NAME_COL}
                  title={nameOf(r.agent)}
                >
                  <Link to={`/agents/${r.agent.agent_id}`} className="block truncate font-semibold text-amber hover:text-hot">
                    {nameOf(r.agent)}
                  </Link>
                </td>
                <td className="text-left px-3 py-2 border-b border-hairline-lo sticky bg-panel z-10 whitespace-nowrap" style={VERDICT_COL}>
                  <StatusPill tone={VERDICT_META[r.verdict].tone}>{VERDICT_META[r.verdict].label}</StatusPill>
                  <span className="block text-[10.5px] text-faint mt-0.5 max-w-[280px] truncate" title={r.why}>
                    {r.why}
                  </span>
                </td>
                <td className="text-right px-3 py-2 border-b border-hairline-lo">{r.loads}</td>
                <td className="text-right px-3 py-2 border-b border-hairline-lo">{money(r.net)}</td>
                <td className="text-right px-3 py-2 border-b border-hairline-lo">
                  {fmtRpm(r.netRpm)}
                  {r.grade && <span className="block text-[10.5px] text-faint">{r.grade}</span>}
                </td>
                <td className="text-right px-3 py-2 border-b border-hairline-lo">{pct0(r.deadheadPct)}</td>
                <td className="text-right px-3 py-2 border-b border-hairline-lo">{shareCell(r.inbound)}</td>
                <td className="text-right px-3 py-2 border-b border-hairline-lo" style={{ color: lastLoadTone(r.lastLoadDays) }}>
                  {r.lastLoadDays == null ? "never" : `${r.lastLoadDays}d`}
                </td>
                <td className="text-right px-3 py-2 border-b border-hairline-lo">
                  {r.outDays} / {r.inboundTouches}
                </td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  </div>
);

// ---- 10. the quarter ----
// The house's KPI cell, with the composing grid's own rules — same as the
// dashboard's boards.
const CELL_RULE = "border-b md:border-b-0 md:border-r ds2-cell-rule";

const monthsSignedSub = (m: MonthsSigned): string =>
  m.of === 0 ? "the quarter hasn't started" : m.missing.length === 0 ? "every month signed" : `${m.missing.join(", ")} unsigned`;

const deltaWord = (now: number, prev: number, suffix = ""): string =>
  `${now === prev ? "level with" : now > prev ? "up from" : "down from"} ${prev}${suffix} last quarter`;

// Why they are on the parked shelf: the owner's own reason, the fact that the
// owner parked them without writing one, or dormancy. "dormant" is never said
// about an agent somebody deliberately parked.
const parkedWhy = (a: Agent): string =>
  a.work_status === "parked" ? a.park_reason?.trim() || "no reason recorded" : "dormant";

const QuarterBoards = ({
  q,
  isAdmin,
  signOffsMissing,
  onOpen,
}: {
  q: QuarterModel<Agent>;
  isAdmin: boolean;
  signOffsMissing: boolean;
  onOpen: (agent: Agent) => void;
}) => (
  <>
    <Panel>
      <SectionHead right={q.opensIn != null ? `${q.range.label} audit opens in ${plural(q.opensIn, "day")}` : undefined}>
        The quarter · {q.range.label}
      </SectionHead>
      <div className="grid grid-cols-2 md:grid-cols-4 border-t border-hairline-lo">
        <BoardCell
          className={CELL_RULE}
          label="Top 3 share"
          value={pct0(q.top3.share)}
          sub={q.top3.prev == null ? "of net · no last quarter to compare" : `of net · ${pct0(q.top3.prev)} last quarter`}
        />
        <BoardCell
          className={CELL_RULE}
          label="Steady agents"
          value={q.steady.n}
          sub={`2+ delivered · ${deltaWord(q.steady.n, q.steady.prev)}`}
          tone={q.steady.n >= q.steady.prev ? "pos" : "neg"}
        />
        <BoardCell
          className={CELL_RULE}
          label="Months signed"
          // A failed sign-off read is not "nothing signed" — it is nothing known.
          value={signOffsMissing ? "—" : `${q.months.signed} of ${q.months.of}`}
          sub={signOffsMissing ? "the sign-offs didn't load" : monthsSignedSub(q.months)}
          tone={signOffsMissing ? "none" : q.months.missing.length === 0 ? "pos" : "amb"}
        />
        <BoardCell label="Risers" value={q.risers.length} sub="parked, giving freight again" tone={q.risers.length > 0 ? "amb" : "none"} />
      </div>
      {q.risers.length > 0 && (
        <>
          <SectionHead>Risers · {q.risers.length} · REL-01 §5G — the book says promote, you decide</SectionHead>
          {q.risers.map((a) => (
            <AgentRow
              key={a.agent_id}
              agent={a}
              chip={{ kind: "up", label: "Riser" }}
              context={`parked — ${parkedWhy(a)} · repeat freight this quarter`}
              daysSince={undefined}
              right={{ value: "↑", caption: "riser" }}
              onOpen={isAdmin ? () => onOpen(a) : undefined}
            />
          ))}
        </>
      )}
    </Panel>

    <Panel>
      <SectionHead right="you park from the sheet, with a reason — never automatically">
        Fed, stayed quiet · prune candidates · {q.prune.fedStayedQuiet.length}
      </SectionHead>
      {q.prune.fedStayedQuiet.length === 0 ? (
        <EmptyLine>Nobody was worked hard for nothing — every tiered agent you reached out to four or more days gave a load or called back.</EmptyLine>
      ) : (
        q.prune.fedStayedQuiet.map((r) => (
          <AgentRow
            key={r.agent.agent_id}
            agent={r.agent}
            chip={{ kind: "down", label: "Prune?" }}
            context={`${bucketWord(r.bucket)} · ${plural(r.outDays, "out-day")} this quarter · no load, no inbound`}
            daysSince={undefined}
            right={{ value: String(r.outDays), caption: "out-days" }}
            onOpen={isAdmin ? () => onOpen(r.agent) : undefined}
          />
        ))
      )}
      <SectionHead>Never fed · a to-do, not a prune · {q.prune.neverFed.length}</SectionHead>
      {q.prune.neverFed.length === 0 ? (
        <EmptyLine>Every tiered agent got at least a couple of days of attention this quarter.</EmptyLine>
      ) : (
        q.prune.neverFed.map((r) => (
          <AgentRow
            key={r.agent.agent_id}
            agent={r.agent}
            chip={{ kind: "never", label: "Never fed" }}
            context={`${bucketWord(r.bucket)} · ${plural(r.outDays, "out-day")} this quarter — the verdict is on us`}
            daysSince={undefined}
            right={{ value: String(r.outDays), caption: "out-days" }}
            onOpen={isAdmin ? () => onOpen(r.agent) : undefined}
          />
        ))
      )}
    </Panel>

    <Panel>
      <SectionHead right="gross per delivered load — what the market pays">Growth · markets to hunt</SectionHead>
      {q.markets.length === 0 ? (
        <EmptyLine>No delivered freight this quarter yet — no market to rank.</EmptyLine>
      ) : (
        <ul className="px-3.5 pb-3.5 grid gap-1.5">
          {q.markets.map((g, i) => (
            <li key={g.state} className="font-condensed text-[13.5px] text-dim">
              <b className="text-ink font-semibold">
                {i + 1}. {g.state}
              </b>{" "}
              — {money(g.avgGross)} a load on {plural(g.loads, "load")}
            </li>
          ))}
        </ul>
      )}
      <FootLine>names to pursue are saved with the quarter's sign-off — one to five of them, printed under the head once it is signed.</FootLine>
    </Panel>
  </>
);

// ---- the sign-off sheet ----
const SignSheet = ({
  open,
  period,
  busy,
  signing,
  error,
  targets,
  onTargets,
  onClose,
  onSign,
}: {
  open: boolean;
  period: ReviewPeriod;
  busy: boolean; // ANY write is in flight — one write at a time on this page
  signing: boolean; // this sheet's own write
  error: string | null;
  targets: string;
  onTargets: (v: string) => void;
  onClose: () => void;
  onSign: () => void;
}) => {
  const isQuarter = period.scope === "quarter";
  // The backend's own ceiling, said out loud before the write is refused. The
  // floor is one, for a month and a quarter alike — a quiet quarter still
  // names one person to go after.
  const max = isQuarter ? 5 : 3;
  const lines = targets.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
  const nextWord = isQuarter
    ? "one to five names to pursue"
    : `targets for ${new Date(Date.UTC(period.range.end.getUTCFullYear(), period.range.end.getUTCMonth(), 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })} — one to three lines`;
  return (
    <RelSheetShell open={open} onClose={onClose} title={`Mark ${period.name} ${isQuarter ? "audited" : "reviewed"}`}>
      <div className="px-5 pt-5 pb-5">
        <p className="font-display text-[22px] text-amber leading-none">
          Mark {period.name} {isQuarter ? "audited" : "reviewed"}
        </p>
        <p className="font-condensed text-[13px] text-dim mt-1.5 leading-snug">
          {isQuarter
            ? "The names you intend to go after next quarter — saved with your signature on this audit."
            : "What the month ahead is for. One to three lines; they print under the head until the next month is signed."}
        </p>
        <div className="mt-3">
          <FieldLabel htmlFor="review-targets">Targets</FieldLabel>
          <textarea
            id="review-targets"
            value={targets}
            onChange={(e) => onTargets(e.target.value)}
            rows={4}
            placeholder={nextWord}
            className="w-full bg-well border border-hairline rounded-[8px] px-3 py-2 text-ink text-[13px] placeholder:text-faint resize-y"
          />
          <p className={`font-condensed text-[11.5px] mt-1 ${lines > max ? "text-status-negative-text" : "text-faint"}`}>
            {plural(lines, "line")} · one to {max}
          </p>
        </div>
        <ErrorLine>{error}</ErrorLine>
        <div className="flex gap-2 mt-3">
          <PrimaryButton
            size="md"
            disabled={busy || lines === 0 || lines > max}
            title={lines === 0 ? "A sign-off carries at least one target" : lines > max ? `One to ${max} lines` : undefined}
            onClick={onSign}
          >
            {signing ? "Signing…" : `Sign ${period.name}`}
          </PrimaryButton>
          <GhostButton size="md" onClick={onClose}>
            Cancel
          </GhostButton>
        </div>
      </div>
    </RelSheetShell>
  );
};

// ---------------------------------------------------------------------------

const tierOfSuggestion = (word: SuggestionRow<Agent>["suggestion"]): number | null =>
  word === "tier1" ? 1 : word === "tier2" ? 2 : word === "tier3" ? 3 : null;

const ReviewView = () => {
  const { agents, loads, contacts, notes, coverage, history, reviews, ladder, now, isAdmin, loadsReady, errors, openAgent, notify, reload } =
    useRelationships();
  // A failed slice is never read as truth: without the sign-offs the month is
  // not "unsigned", it is unknown; without the tier history a suggestion the
  // owner already held may show again, so the head says the holds are unknown.
  const signOffsMissing = errors.reviews != null;
  const historyMissing = errors.history != null;

  const [scope, setScope] = useState<ReviewScope>("month");
  const [ago, setAgo] = useState(0);
  const [openScore, setOpenScore] = useState<string | null>(null);
  const [approving, setApproving] = useState<{ agentId: string; reason: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Every write names where it failed, so the sign-off's error shows inside the
  // sheet and a tier write's shows on the page — never the wrong one.
  const [error, setError] = useState<{ where: "board" | "sign"; message: string } | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [targets, setTargets] = useState("");

  const period = useMemo(() => reviewPeriod(scope, ago, now), [scope, ago, now]);
  const model = useMemo<ReviewModel<Agent>>(
    () =>
      buildReviewModel<Agent>({
        agents,
        loads,
        contacts,
        notes,
        coverage,
        history,
        reviews,
        ladder,
        period,
        systemStart: SYSTEM_START,
        now,
        loadsReady,
      }),
    [agents, loads, contacts, notes, coverage, history, reviews, ladder, period, now, loadsReady],
  );

  const signed = model.signed;
  const win = period.win;
  const evidenceWord = `evidence: 90 days ending ${shortDate(win.endKey)}`;

  const openTouch = (agent: Agent, prefill: TouchPrefill) => openAgent(agent.agent_id, { prefill });

  const run = async (key: string, where: "board" | "sign", fn: () => Promise<void>) => {
    setBusy(key);
    // Clear only THIS surface's error — a tier write must never wipe the
    // sign-off's message out from under the sheet, or the other way round.
    setError((e) => (e?.where === where ? null : e));
    try {
      await fn();
    } catch (e) {
      setError({ where, message: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(null);
    }
  };
  const errFor = (where: "board" | "sign") => (error?.where === where ? error.message : null);

  // APPROVE — the tier patch carries the reason, and the backend writes the
  // history row. A "Losing money" row has no tier to set: it opens the sheet,
  // where Park lives behind its own required reason.
  const approve = (row: SuggestionRow<Agent>) => {
    if (row.losing) {
      openAgent(row.agent.agent_id);
      // The sheet opens at the top; Park is at the bottom behind its own
      // required reason, so the row says where it went.
      notify("Park is at the bottom of the sheet — a reason is required");
      return;
    }
    setError((e) => (e?.where === "board" ? null : e));
    setApproving({ agentId: row.agent.agent_id, reason: row.evidence });
  };

  const confirmApprove = (row: SuggestionRow<Agent>, reason: string) =>
    run(`approve:${row.agent.agent_id}`, "board", async () => {
      await patchAgent(row.agent.agent_id, { relationship_tier: tierOfSuggestion(row.suggestion), reason: reason.trim() });
      notify(`Tier set · ${nameOf(row.agent)} · ${row.suggestionWord}`);
      setApproving(null);
      await reload();
    });

  // HOLD — a history row with from = to and the evidence in its reason. The
  // suggestion stays quiet until the loads or the band behind it move.
  const hold = (row: SuggestionRow<Agent>) =>
    run(`hold:${row.agent.agent_id}`, "board", async () => {
      await holdTier(row.agent.agent_id, row.evidence);
      notify(`Held · ${nameOf(row.agent)} — until the numbers change`);
      await reload();
    });

  // Open the sheet on what is stored — empty for a first signature, the signed
  // lines when the owner is correcting them.
  const openSign = (prefill: string) => {
    setTargets(prefill);
    setSignOpen(true);
  };

  const sign = () =>
    run("sign", "sign", async () => {
      await signRelationshipReview({ period_key: period.key, kind: period.scope, targets });
      notify(`${period.name} signed`);
      setSignOpen(false);
      setTargets("");
      await reload();
    });

  const suggestionActions = (row: SuggestionRow<Agent>): ReactNode =>
    isAdmin ? (
      <>
        <PrimaryButton size="sm" disabled={busy != null} onClick={() => approve(row)}>
          Approve
        </PrimaryButton>
        <GhostButton size="sm" disabled={busy != null} onClick={() => void hold(row)}>
          {busy === `hold:${row.agent.agent_id}` ? "Holding…" : "Hold"}
        </GhostButton>
      </>
    ) : (
      <span className="font-condensed text-[12px] text-faint whitespace-nowrap">the owner sets tiers</span>
    );

  const suggestionRow = (row: SuggestionRow<Agent>) => (
    <div key={row.agent.agent_id}>
      <AgentRow
        agent={row.agent}
        chip={verdictChip(row)}
        context={row.context}
        daysSince={undefined}
        market={<NowSuggested row={row} />}
        loadsCell={fmtRpm(row.rpm)}
        right={{ value: String(row.delivered), caption: "loads" }}
        actions={suggestionActions(row)}
      />
      {approving?.agentId === row.agent.agent_id && (
        <div className="flex items-center gap-2 flex-wrap px-3.5 pb-3 -mt-1">
          <input
            value={approving.reason}
            onChange={(e) => setApproving({ agentId: row.agent.agent_id, reason: e.target.value })}
            aria-label={`Reason for ${nameOf(row.agent)} → ${row.suggestionWord}`}
            className="ds-input flex-1 min-w-[220px]"
          />
          <PrimaryButton
            size="sm"
            disabled={busy != null || approving.reason.trim().length === 0}
            title={approving.reason.trim().length === 0 ? "A tier move needs a written reason" : undefined}
            onClick={() => void confirmApprove(row, approving.reason)}
          >
            {busy === `approve:${row.agent.agent_id}` ? "Applying…" : `Set ${row.suggestionWord}`}
          </PrimaryButton>
          <GhostButton size="sm" onClick={() => setApproving(null)}>
            Cancel
          </GhostButton>
        </div>
      )}
    </div>
  );

  const copyReport = () => {
    copyText(reviewReportText(model));
    notify("Copied · the review");
  };

  const activeScores = model.scores.filter((r) => r.active).length;
  const inboundWord = inboundHeadline(model.inbound.all);
  const chartData = model.months.map((m) => ({ month: `${monthWord(m.month)} ’${m.month.slice(2, 4)}`, share: m.all.share }));

  return (
    <div className="mt-4">
      {/* ---- the control row ---- */}
      <div className="ds2-board px-3.5 py-3 flex items-center gap-x-3 gap-y-2 flex-wrap">
        <SegmentedTabs
          tabs={SCOPE_TABS}
          value={scope}
          onChange={(v) => {
            setScope(v);
            setAgo(0);
          }}
          size="sm"
          ariaLabel="Review window"
        />
        <span className="font-display text-[16px] tracking-[.05em] flex items-center gap-2">
          <button type="button" className="text-faint hover:text-ink" onClick={() => setAgo((a) => a + 1)} aria-label="previous period">
            ‹
          </button>
          {period.label}
          <button
            type="button"
            className="text-faint hover:text-ink disabled:opacity-30"
            disabled={ago === 0}
            onClick={() => setAgo((a) => Math.max(0, a - 1))}
            aria-label="next period"
          >
            ›
          </button>
        </span>
        <span className="font-condensed text-[11.5px] text-faint">{evidenceWord}</span>
        <span className="flex-1" />
        <GhostButton size="sm" onClick={copyReport}>
          Copy report
        </GhostButton>
        {signed ? (
          <StatusPill tone="good">
            Reviewed {shortDate(signed.reviewed_at)} · {signed.reviewed_by_name ?? "owner"}
          </StatusPill>
        ) : isAdmin ? (
          <PrimaryButton
            size="sm"
            disabled={signOffsMissing}
            title={signOffsMissing ? "sign-offs didn't load — retry above" : undefined}
            onClick={() => openSign("")}
          >
            Mark {period.name} {period.scope === "quarter" ? "audited" : "reviewed"}
          </PrimaryButton>
        ) : (
          <span className="flex items-center gap-1.5 font-condensed text-[12.5px] text-faint">
            <Lock size={12} /> the owner signs the month
          </span>
        )}
      </div>
      {signed?.targets && (
        <div className="ds2-board mt-2 px-3.5 py-2.5">
          <p className="font-condensed text-[11px] tracking-[.12em] uppercase text-faint">Targets</p>
          <ul className="mt-1 grid gap-0.5">
            {signed.targets.split("\n").map((t, i) => (
              <li key={`${t}-${i}`} className="font-condensed text-[13.5px] text-ink">
                {t}
              </li>
            ))}
          </ul>
          {/* A signature stands, but a typo in the targets is still a typo —
              the owner reopens the sheet on what is stored and signs again;
              the write upserts, so the period keeps one row. */}
          {isAdmin && (
            <button
              type="button"
              className="mt-1.5 font-condensed text-[12px] text-amber-hi hover:text-hot underline underline-offset-2"
              onClick={() => openSign(signed.targets ?? "")}
            >
              edit
            </button>
          )}
        </div>
      )}
      <ErrorLine>{errFor("board")}</ErrorLine>

      {/* ---- 1. IS IT WORKING — the view's one forged plate ---- */}
      <ForgedPlate chamfer className="mt-3 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2 flex-wrap">
          <Chip tone="job">The one number</Chip>
          <Chip tone="day">since {shortDate(SYSTEM_START)}</Chip>
          <Chip tone="dim">90d</Chip>
        </div>
        <p className="font-display text-[26px] text-amber leading-none mt-3">
          {model.inbound.all.attributed === 0
            ? "nothing attributed yet"
            : model.inbound.all.attributed < INBOUND_HEADLINE_MIN
              ? `${fractionWord(model.inbound.all)} came to you`
              : `${inboundWord} inbound`}
        </p>
        {(model.inbound.all.attributed >= INBOUND_HEADLINE_MIN || model.inbound.prospects.attributed > 0) && (
          <p className="font-condensed text-[13px] text-dim mt-1">
            {model.inbound.all.attributed >= INBOUND_HEADLINE_MIN ? `${fractionWord(model.inbound.all)} came to you` : ""}
            {model.inbound.all.attributed >= INBOUND_HEADLINE_MIN && model.inbound.prospects.attributed > 0 ? " · " : ""}
            {model.inbound.prospects.attributed > 0 ? `prospects ${fractionWord(model.inbound.prospects)}` : ""}
          </p>
        )}
        {/* by the agent's CURRENT bucket — untiered agents are the sub above,
            never folded into Tier 3. */}
        <div className="grid grid-cols-3 gap-3 mt-3.5">
          <Cell label="Tier 1" value={shareCell(model.inbound.tier1)} sub="came to you" />
          <Cell label="Tier 2" value={shareCell(model.inbound.tier2)} sub="came to you" />
          <Cell label="Tier 3" value={shareCell(model.inbound.tier3)} sub="came to you" />
        </div>
        <Well className="mt-3 px-3 py-2.5 flex gap-3 items-start">
          <span className="font-condensed text-[11px] tracking-[.12em] uppercase text-amber shrink-0 mt-0.5">Why</span>
          <p className="text-[13.5px] text-ink/90 leading-snug">
            Inbound = loads where the agent reached out first, over loads booked since system start. Pre-system loads carry no
            attribution and sit outside the math. The percent appears at {INBOUND_HEADLINE_MIN} attributed loads.
          </p>
        </Well>
      </ForgedPlate>
      <MonthTable model={model} />
      {model.chartEarned && <InboundChart data={chartData} />}

      {/* ---- 2. RE-TIER SUGGESTIONS ---- */}
      <Panel>
        <SectionHead right={model.suggestions.held.length > 0 ? `${model.suggestions.held.length} held` : undefined}>
          Re-tier suggestions · {model.suggestions.rows.length}
          {historyMissing && <span className="ml-2 normal-case tracking-normal text-faint/70">holds unknown</span>}
        </SectionHead>
        {model.suggestions.rows.length === 0 ? (
          <EmptyLine>
            {loadsReady
              ? "Nothing to approve — every tier matches what the numbers say."
              : "The loads didn't come through — no suggestion is claimed until they do."}
          </EmptyLine>
        ) : (
          <>
            <RowHeader cols={["Agent", "Now → suggested", "All-in RPM", "Loads"]} />
            {model.suggestions.rows.map(suggestionRow)}
          </>
        )}
        {model.suggestions.needsTier.length > 0 && (
          <>
            <SectionHead>Needs a tier · {model.suggestions.needsTier.length} · established, never placed</SectionHead>
            {model.suggestions.needsTier.map(suggestionRow)}
          </>
        )}
        <FootLine>
          {isAdmin ? (
            <>
              Approve writes the tier and a history row — who, when, why, with the reason prefilled from the evidence and editable.
              Hold records your “not now”; the suggestion stays quiet until the loads or the ladder band behind it move.
            </>
          ) : (
            <>
              <Lock size={12} className="mt-0.5 shrink-0" /> the owner sets tiers — dash only suggests, and nothing re-tiers itself.
            </>
          )}
        </FootLine>
      </Panel>

      {/* ---- 3. COOLING ---- */}
      <Panel>
        <SectionHead right="monitoring — not a to-do">
          <span className="text-status-info-text">Cooling · for the owner · {model.cooling.flagged.length}</span>
        </SectionHead>
        {model.cooling.flagged.length === 0 ? (
          <EmptyLine>
            Nobody cooling — every tiered agent has had a two-way contact inside their threshold (Tier 1 · 21 days, Tier 2 · 42,
            Tier 3 · 90).
          </EmptyLine>
        ) : (
          model.cooling.flagged.map((r) => (
            <AgentRow
              key={r.agent.agent_id}
              agent={r.agent}
              lead={{ kind: "cool", label: "Cooling" }}
              chip={null}
              context={
                r.days == null
                  ? `Tier ${r.tier} · never a two-way contact · last load ${shortDate(r.lastLoad) ?? "never"}`
                  : `Tier ${r.tier} · last two-way contact ${shortDate(r.last)} · last load ${shortDate(r.lastLoad) ?? "never"}`
              }
              daysSince={r.days}
              right={{ value: r.days == null ? "never" : `${r.days}d`, caption: "two-way" }}
              onOpen={isAdmin ? () => openTouch(r.agent, { direction: "outbound", method: "call", type: "owner_personal" }) : undefined}
            />
          ))
        )}
        {model.cooling.watch.length > 0 && (
          <>
            <SectionHead>Watch · {model.cooling.watch.length}</SectionHead>
            {model.cooling.watch.map((r) => (
              <AgentRow
                key={r.agent.agent_id}
                agent={r.agent}
                chip={null}
                context={`Tier ${r.tier} · last two-way contact ${shortDate(r.last)} · flags ${shortDate(r.flagsOn)} if nothing changes`}
                daysSince={r.days}
                right={{ value: r.days == null ? "never" : `${r.days}d`, caption: "two-way" }}
                dimmed
                onOpen={isAdmin ? () => openTouch(r.agent, { direction: "outbound", method: "call", type: "owner_personal" }) : undefined}
              />
            ))}
          </>
        )}
        <FootLine>
          {isAdmin ? (
            <>tap a row to log your own thread — Owner personal, uncapped. A reached call or a load resets the clock; a voicemail or an email does not. It never becomes a task and never sends anything.</>
          ) : (
            <>
              <Lock size={12} className="mt-0.5 shrink-0" /> surfaced to the owner — nothing here is owed by Dispatch.
            </>
          )}
        </FootLine>
      </Panel>

      {/* ---- 4. MILESTONES ---- */}
      <Panel>
        <SectionHead>
          Milestones · {model.milestones.waiting.length} waiting · {model.milestones.sentThisMonth} sent this month
        </SectionHead>
        {model.milestones.waiting.length === 0 ? (
          <EmptyLine>Nothing waiting — no load-count, streak or anniversary crossing is open. Milestones flag at 5 · 10 · 25 · 50 · 100 loads, streaks at 10 · 20 · 50.</EmptyLine>
        ) : (
          model.milestones.waiting.map((f) => (
            <AgentRow
              key={`${f.agent.agent_id}-${f.marker}`}
              agent={f.agent}
              chip={{ kind: "section", label: f.label }}
              // The draft itself lives on Today's nurture plate; the row here
              // opens the sheet with the marker note so the two agree.
              context={`${f.kind === "anniversary" ? "together" : f.kind === "streak" ? "on time, claim-free" : "delivered"}${f.crossedOn ? ` · crossed ${shortDate(f.crossedOn)}` : ""} · not yet sent · draft on Today's nurture plate`}
              daysSince={undefined}
              right={{ value: String(f.n), caption: f.kind }}
              onOpen={() =>
                openTouch(f.agent, {
                  direction: "outbound",
                  method: methodFor(f.agent.preferred_contact),
                  type: "milestone",
                  note: `${milestoneMarker(f.kind, f.n)} ${f.label}`,
                })
              }
            />
          ))
        )}
      </Panel>

      {/* ---- 5. CONTACT CAP ---- */}
      <Panel>
        <SectionHead right="one proactive touch per agent per week">
          Contact cap · this week · {model.cap.over.length} over · {model.cap.touchedOnce} touched once ·{" "}
          {model.cap.overrides} overrides this week
        </SectionHead>
        {model.cap.over.length === 0 ? (
          <EmptyLine>Nobody over the cap this week — as it should read.</EmptyLine>
        ) : (
          model.cap.over.map((r) => (
            <AgentRow
              key={r.agent.agent_id}
              agent={r.agent}
              chip={{ kind: "touched", label: r.override ? "Override" : "Over cap" }}
              context={r.touches.map((t) => `${contactTypeLabel(t.type)} ${shortDate(t.contacted_at)}`).join(" + ")}
              daysSince={undefined}
              right={{ value: String(r.touches.length), caption: "this week" }}
              onOpen={() => openAgent(r.agent.agent_id)}
            />
          ))
        )}
        {/* An override that stayed inside the cap would otherwise be counted
            in the head and never shown — the decision the audit exists to
            surface, invisible. */}
        {model.cap.overrideOnly.length > 0 && (
          <>
            <SectionHead>Logged over the cap · {model.cap.overrideOnly.length}</SectionHead>
            {model.cap.overrideOnly.map((r) => (
              <AgentRow
                key={r.agent.agent_id}
                agent={r.agent}
                chip={{ kind: "touched", label: "Override" }}
                context={capOverrideWord(r.touches[0])}
                daysSince={undefined}
                right={{ value: "1", caption: "this week" }}
                onOpen={() => openAgent(r.agent.agent_id)}
              />
            ))}
          </>
        )}
      </Panel>

      {/* ---- 6. HYGIENE ---- */}
      <Panel>
        <SectionHead>Hygiene</SectionHead>
        {model.hygiene.length === 0 ? (
          <EmptyLine>Every active agent has a phone, a preferred channel, a footprint and a best time to call.</EmptyLine>
        ) : (
          <ul className="px-3.5 pb-3.5 grid gap-1">
            {model.hygiene.map((h) => (
              <li key={h.key} className="font-condensed text-[13px] text-dim">
                <b className="text-ink font-semibold">{h.agents.length}</b> {h.label} —{" "}
                {h.agents.slice(0, 3).map((a, i) => (
                  <span key={a.agent_id}>
                    {i > 0 && ", "}
                    <BookLink agent={a} />
                  </span>
                ))}
                {h.agents.length > 3 && ` +${h.agents.length - 3}`}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ---- 7. TIER MOVES ---- */}
      <Panel>
        <SectionHead>Tier moves this {period.scope} · {model.moves.length}</SectionHead>
        {model.moves.length === 0 ? (
          <EmptyLine>{historyMissing ? "tier history didn't load" : `No tier moves this ${period.scope}.`}</EmptyLine>
        ) : (
          <ul className="px-3.5 pb-3.5 grid gap-1.5">
            {model.moves.map((h) => (
              <li key={h.history_id} className="font-condensed text-[13px] text-dim leading-snug">
                <span className="text-ink font-semibold">{shortDate(h.changed_at)}</span> ·{" "}
                <Link to={`/agents/${h.agent_id}`} className="text-amber-hi hover:text-hot">
                  {`${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() || "—"}
                </Link>
                {h.broker_name ? ` ${h.broker_name}` : ""} · {tierWord(h.from_tier)} → {tierWord(h.to_tier)} · “{h.reason}” ·{" "}
                {h.changed_by_name ?? "—"}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ---- 8. GONE QUIET ---- */}
      <Panel>
        <SectionHead>Gone quiet · Tier 1 / 2 with no two-way contact in 30 days · {model.quiet.length}</SectionHead>
        {model.quiet.length === 0 ? (
          <EmptyLine>No Tier 1 or Tier 2 agent has gone a month without a two-way contact.</EmptyLine>
        ) : (
          model.quiet.map((r) => (
            <AgentRow
              key={r.agent.agent_id}
              agent={r.agent}
              chip={null}
              context={`Tier ${r.tier} · ${r.last ? `last two-way contact ${shortDate(r.last)}` : "never a two-way contact"}`}
              daysSince={r.days}
              right={{ value: r.days == null ? "never" : `${r.days}d`, caption: "two-way" }}
              onOpen={() =>
                isAdmin
                  ? openTouch(r.agent, { direction: "outbound", method: "call", type: "owner_personal" })
                  : openAgent(r.agent.agent_id)
              }
            />
          ))
        )}
      </Panel>

      {/* ---- 9. SCORECARD ---- */}
      <Panel>
        <SectionHead>
          Scorecard · 90 days ending {shortDate(win.endKey)} · {plural(activeScores, "agent")} with activity
        </SectionHead>
        {model.scores.length === 0 ? (
          <EmptyLine>No agent has a tier or a story in this window yet.</EmptyLine>
        ) : (
          <>
            <div className="md:hidden">
              {model.scores.map((r, i) => {
                const groupHead = i === 0 || model.scores[i - 1].bucket !== r.bucket;
                return (
                  <Fragment key={r.agent.agent_id}>
                    {groupHead && <SectionHead>{bucketWord(r.bucket)}</SectionHead>}
                    <AgentRow
                      agent={r.agent}
                      chip={{ kind: r.verdict === "up" ? "up" : r.verdict === "down" ? "down" : r.verdict === "thin" ? "suggest" : "section", label: VERDICT_META[r.verdict].label }}
                      context={`${plural(r.loads, "load")} · ${money(r.net)} · ${fmtRpm(r.netRpm)}${r.grade ? ` ${r.grade}` : ""}`}
                      daysSince={undefined}
                      right={{ value: r.lastLoadDays == null ? "never" : `${r.lastLoadDays}d`, caption: "last load" }}
                      onOpen={() => setOpenScore((id) => (id === r.agent.agent_id ? null : r.agent.agent_id))}
                    />
                    {openScore === r.agent.agent_id && <ScoreExpansion row={r} />}
                  </Fragment>
                );
              })}
            </div>
            <ScoreTable rows={model.scores} />
          </>
        )}
        <FootLine>
          <span>
            ▲ and ▼ are the re-tier suggestion's own direction · under three loads in the window there is no verdict at all ·
            a ▼ on a Tier 1 or 2 we reached out to on fewer than four days reads HOLD — never fed, the verdict is on us ·
            tier moves are the owner's — with a written reason, every time.
          </span>
        </FootLine>
      </Panel>

      {/* ---- 10. THE QUARTER ---- */}
      {model.quarter && (
        <QuarterBoards q={model.quarter} isAdmin={isAdmin} signOffsMissing={signOffsMissing} onOpen={(a) => openAgent(a.agent_id)} />
      )}

      <SignSheet
        open={signOpen}
        period={period}
        busy={busy != null}
        signing={busy === "sign"}
        error={errFor("sign")}
        targets={targets}
        onTargets={setTargets}
        onClose={() => setSignOpen(false)}
        onSign={() => void sign()}
      />
    </div>
  );
};

export default ReviewView;
