import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import type { Agent } from "@/types/agent";
import { type AgentScorecard, SINGLE_CAP } from "@/lib/metrics/agentScorecard";
import { money, rpm as fmtRpm } from "@/lib/format";
import {
  TIER_META,
  SPECIALTY_META,
  dwellStatus,
  DWELL_TONE,
  TREND_META,
} from "./agentDisplay";
import { nameOf } from "@/lib/relationships/nameOf";
import { standingOf } from "@/lib/agents/standing";
import type { Book, BookRate, RateVerdict, SecondCall } from "@/lib/metrics/agentByType";

export interface AgentRow {
  agent: Agent;
  card: AgentScorecard;
}

type SortKey =
  | "goto"
  | "standard"
  | "specialized"
  | "dwell"
  | "loads"
  | "revenue"
  | "book"
  | "last"
  | "rating";

// TWO RATE COLUMNS, not one. A desk posts standard freight and it posts
// oversize, they are held to different rungs, and the same desk can be
// excellent at one and dreadful at the other — ROR is $6.05 standard and
// $2.46 oversize. Pooled into a single $/mi both halves disappear into a
// middling number and the list ranks two opposites the same.
const COLS: { key: SortKey; label: string; l?: boolean }[] = [
  { key: "rating", label: "Rating" },
  { key: "goto", label: "Go-to" },
  { key: "standard", label: "Standard" },
  { key: "specialized", label: "Specialized" },
  { key: "dwell", label: "Dwell" },
  { key: "loads", label: "Loads" },
  { key: "revenue", label: "Rev" },
  { key: "book", label: "% book" },
  { key: "last", label: "Last" },
];

// The Scorer's own words, so a desk's rate reads the same here as a load's
// does there. Colour carries the meaning and nothing else.
const VERDICT_META: Record<RateVerdict, { label: string; fg: string }> = {
  "below-cost": { label: "below cost", fg: "var(--color-status-negative-text)" },
  thin: { label: "thin", fg: "var(--color-amber-hi)" },
  profitable: { label: "profitable", fg: "var(--color-cat2)" },
  solid: { label: "solid", fg: "var(--color-cat2)" },
  prime: { label: "prime", fg: "var(--color-hot)" },
};

/** One book's cell: the rate, and either its verdict or its load count. */
const RateCell = ({ r }: { r: BookRate | undefined }) => {
  if (!r || r.rpm == null)
    // Never a zero here: on a rate column a 0 reads as "they pay nothing",
    // when the truth is they have never sent you this kind of freight.
    return <span className="text-faint">—</span>;
  const v = r.verdict ? VERDICT_META[r.verdict] : null;
  return (
    <span className="whitespace-nowrap">
      <span style={{ color: v?.fg }} className="tabular-nums">
        {fmtRpm(r.rpm)}
      </span>{" "}
      {v ? (
        <span className="text-[11.5px]" style={{ color: v.fg }}>
          {v.label}
        </span>
      ) : (
        /* One load is a number, not a grade. */
        <span className="text-[11.5px] text-faint">{r.loads} load</span>
      )}
    </span>
  );
};

const stars = (r: number | null | undefined): string =>
  r == null ? "—" : "★".repeat(r) + "☆".repeat(5 - r);

const shortDate = (d: string | null): string =>
  d
    ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : "—";

const compare = (
  a: AgentRow,
  b: AgentRow,
  key: SortKey,
  rates?: Map<string, Record<Book, BookRate>>,
): number => {
  const A = a.card;
  const B = b.card;
  const rate = (row: AgentRow, book: Book) =>
    rates?.get(row.agent.agent_id)?.[book]?.rpm ?? -1;
  switch (key) {
    case "standard":
      return rate(b, "standard") - rate(a, "standard");
    case "specialized":
      return rate(b, "specialized") - rate(a, "specialized");
    case "dwell":
      return B.moneyLostLoads - A.moneyLostLoads; // worst (most money lost) first
    case "loads":
      return B.loadCount - A.loadCount;
    case "revenue":
      return B.revenue - A.revenue;
    case "last":
      return (b.card.lastWorked ?? "").localeCompare(a.card.lastWorked ?? "");
    case "rating":
      return (b.agent.rating ?? -1) - (a.agent.rating ?? -1);
    case "goto":
    default:
      return TIER_META[B.tier].rank - TIER_META[A.tier].rank || B.revenue - A.revenue;
  }
};

export const AgentTable = ({
  rows,
  shareByAgent,
  ratesByAgent,
  secondCall,
}: {
  rows: AgentRow[];
  shareByAgent?: Map<string, number>;
  ratesByAgent?: Map<string, Record<Book, BookRate>>;
  secondCall?: Map<string, SecondCall>;
}) => {
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortKey>("goto");
  const shareOf = (id: string) => shareByAgent?.get(id) ?? 0;

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        sort === "book"
          ? (shareByAgent?.get(b.agent.agent_id) ?? 0) -
            (shareByAgent?.get(a.agent.agent_id) ?? 0)
          : compare(a, b, sort, ratesByAgent),
      ),
    [rows, sort, shareByAgent, ratesByAgent],
  );

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-sm border-collapse" style={{ minWidth: 680 }}>
        <thead>
          <tr>
            <th className="text-left font-normal text-[11px] uppercase tracking-wide text-dim py-2 px-2">
              Agent
            </th>
            {COLS.map((c) => (
              <th
                key={c.key}
                onClick={() => setSort(c.key)}
                className="text-right font-normal text-[11px] uppercase tracking-wide py-2 px-2 cursor-pointer select-none whitespace-nowrap hover:text-ink"
                style={{ color: sort === c.key ? "var(--color-amber-hi)" : undefined }}
              >
                {c.label}
                {sort === c.key ? " ▼" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ agent, card }) => {
            const spec =
              card.specialty.tag !== "standard" ? SPECIALTY_META[card.specialty.tag] : null;
            const tier = TIER_META[card.tier];
            const dwell = dwellStatus(card);
            const trend = card.trend ? TREND_META[card.trend] : null;
            const tint =
              card.tier === "call-first"
                ? "linear-gradient(90deg,color-mix(in srgb, var(--color-status-positive-text) 6%, transparent),transparent 45%)"
                : card.tier === "watch"
                  ? "linear-gradient(90deg,color-mix(in srgb, var(--color-amber-hi) 5%, transparent),transparent 45%)"
                  : undefined;
            return (
              <tr
                key={agent.agent_id}
                onClick={() => navigate(`/agents/${agent.agent_id}`)}
                className="cursor-pointer hover:bg-well/40"
                style={{ background: tint, borderTop: "0.5px solid color-mix(in srgb, var(--color-ink) 6%, transparent)" }}
              >
                <td className="py-2 px-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-ink truncate">
                      {nameOf(agent)}
                    </span>
                    {spec && (
                      <span
                        className="text-[11px] font-bold tracking-wide px-1.5 py-0.5 rounded"
                        style={{ color: spec.fg, background: spec.bg, border: `1px solid ${spec.border}` }}
                      >
                        {spec.label}
                      </span>
                    )}
                    {card.ratingFlag && (
                      <TriangleAlert size={12} style={{ color: "var(--color-amber-hi)", flexShrink: 0 }} />
                    )}
                  </div>
                </td>
                {/* ARCHIVED BEATS THE STARS. This table used to print
                    ★★☆☆☆ for a desk the cards were calling PARKED — the same
                    row, one toggle apart — because it rolled its own stars()
                    and never read work_status. One view now, and the standing
                    is read from one place. */}
                <td className="text-right py-2 px-2 whitespace-nowrap" style={{ color: "var(--color-amber-hi)" }}>
                  {standingOf(agent) === "parked" ? (
                    <span
                      className="text-[11.5px] font-semibold"
                      style={{ color: "var(--color-status-negative-text)" }}
                    >
                      ARCHIVED
                      {agent.rating != null && (
                        <span className="text-faint font-normal"> · was {agent.rating}</span>
                      )}
                    </span>
                  ) : (
                    stars(agent.rating)
                  )}
                </td>
                <td className="text-right py-2 px-2">
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap"
                    style={{ color: tier.fg, background: tier.bg, border: `1px solid ${tier.border}` }}
                  >
                    {tier.label}
                  </span>
                </td>
                <td className="text-right py-2 px-2">
                  <RateCell r={ratesByAgent?.get(agent.agent_id)?.standard} />
                </td>
                <td className="text-right py-2 px-2">
                  <RateCell r={ratesByAgent?.get(agent.agent_id)?.specialized} />
                </td>
                <td className="text-right py-2 px-2 whitespace-nowrap" style={{ color: DWELL_TONE[dwell.tone] }}>
                  {dwell.label}
                </td>
                <td className="text-right py-2 px-2 text-dim tabular-nums">{card.loadCount}</td>
                <td className="text-right py-2 px-2 tabular-nums">{money(card.revenue)}</td>
                <td
                  className="text-right py-2 px-2 tabular-nums"
                  style={{ color: shareOf(agent.agent_id) > SINGLE_CAP ? "var(--color-amber-hi)" : "var(--color-dim)" }}
                  title="share of your last-90-day book"
                >
                  {shareOf(agent.agent_id) > 0 ? `${Math.round(shareOf(agent.agent_id) * 100)}%` : "—"}
                </td>
                <td className="text-right py-2 px-2 whitespace-nowrap">
                  {/* A desk worked ONCE that cleared its own book's rung.
                      Forty-five of fifty-six desks have a single load and no
                      tier can rank them; this marks the ten that already
                      showed one good number and were never called back. */}
                  {secondCall?.has(agent.agent_id) ? (
                    <span
                      className="text-[11.5px] font-semibold"
                      style={{ color: "var(--color-cat2)" }}
                      title={`One load at ${fmtRpm(secondCall.get(agent.agent_id)!.rpm)} — above its ${fmtRpm(secondCall.get(agent.agent_id)!.minimum)} rung`}
                    >
                      second call
                    </span>
                  ) : (
                    <>
                      {trend ? (
                        <span style={{ color: trend.fg }}>{trend.glyph}</span>
                      ) : (
                        <span className="text-dim">·</span>
                      )}{" "}
                      <span className="text-dim text-xs">{shortDate(card.lastWorked)}</span>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
