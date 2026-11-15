import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent } from "@/types/agent";
import type { AgentScorecard } from "@/lib/metrics/agentScorecard";
import { money, rpm as fmtRpm } from "@/lib/format";
import { SPECIALTY_META } from "./agentDisplay";
import { nameOf } from "@/lib/agents/nameOf";
import { standingOf, standingLabel } from "@/lib/agents/standing";
import type { Book, BookRate, RateVerdict, SecondCall } from "@/lib/metrics/agentByType";

export interface AgentRow {
  agent: Agent;
  card: AgentScorecard;
}

type SortKey = "rating" | "standard" | "specialized" | "loads" | "revenue" | "last";

// THE SEVEN COLUMNS THE SHEET DREW, and no more. Desk · Rating · Standard ·
// Specialized · Loads · Revenue · Last worked. The build before this one
// carried ten: a computed Go-to tier that was also the default sort, a Dwell
// word that read "clean" on every row but one, and a 90-day share that read
// "—" on most. The list is ordered by Jason's own rating, then by revenue;
// nothing on it grades a desk but him.
const COLS: { key: SortKey; label: string }[] = [
  { key: "rating", label: "Rating" },
  { key: "standard", label: "Standard" },
  { key: "specialized", label: "Specialized" },
  { key: "loads", label: "Loads" },
  { key: "revenue", label: "Revenue" },
  { key: "last", label: "Last worked" },
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

// The rating in the scale's own words ("4 · Good"), toned by what the word
// means. A parked desk reads PARKED with its reason — the one line that
// explains why it is behind the chip — and the stars it comes back to, faint.
const RATING_TONE: Record<number, string> = {
  5: "text-status-positive-text",
  4: "text-status-positive-text",
  3: "text-dim",
  2: "text-status-aware-text",
  1: "text-status-negative-text",
};

const RatingCell = ({ agent }: { agent: Agent }) => {
  const s = standingOf(agent);
  if (s === "parked")
    return (
      <span className="whitespace-nowrap">
        <span className="text-[11.5px] font-semibold tracking-[.06em] text-status-negative-text">PARKED</span>
        <span className="text-[11.5px] text-faint">
          {" · "}
          {agent.park_reason?.trim() || "no reason written"}
          {agent.rating != null ? ` · was ${agent.rating}` : ""}
        </span>
      </span>
    );
  if (s == null) return <span className="text-faint">Unrated</span>;
  return (
    <span className={`whitespace-nowrap font-condensed font-semibold ${RATING_TONE[s] ?? "text-dim"}`}>
      {standingLabel(s)}
    </span>
  );
};

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
    case "loads":
      return B.loadCount - A.loadCount;
    case "revenue":
      return B.revenue - A.revenue;
    case "last":
      return (B.lastWorked ?? "").localeCompare(A.lastWorked ?? "");
    case "rating":
    default:
      // Your call orders the list; revenue breaks the tie.
      return (b.agent.rating ?? -1) - (a.agent.rating ?? -1) || B.revenue - A.revenue;
  }
};

export const AgentTable = ({
  rows,
  ratesByAgent,
  secondCall,
}: {
  rows: AgentRow[];
  ratesByAgent?: Map<string, Record<Book, BookRate>>;
  secondCall?: Map<string, SecondCall>;
}) => {
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortKey>("rating");

  const sorted = useMemo(
    () => [...rows].sort((a, b) => compare(a, b, sort, ratesByAgent)),
    [rows, sort, ratesByAgent],
  );

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-sm border-collapse" style={{ minWidth: 680 }}>
        <thead>
          <tr>
            <th className="text-left font-normal text-[11px] uppercase tracking-wide text-dim py-2 px-2">
              Desk
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
            const second = secondCall?.get(agent.agent_id);
            return (
              <tr
                key={agent.agent_id}
                onClick={() => navigate(`/agents/${agent.agent_id}`)}
                className="cursor-pointer hover:bg-well/40"
                style={{ borderTop: "0.5px solid color-mix(in srgb, var(--color-ink) 6%, transparent)" }}
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
                    {/* A desk worked ONCE that cleared its own book's rung.
                        Beside the name, so the Last-worked column keeps the
                        one date you need before you ring them. */}
                    {second && (
                      <span
                        className="text-[11px] font-semibold tracking-[.06em] uppercase whitespace-nowrap"
                        style={{ color: "var(--color-cat2)" }}
                        title={`One load at ${fmtRpm(second.rpm)} — above its ${fmtRpm(second.minimum)} rung`}
                      >
                        second call
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-right py-2 px-2">
                  <RatingCell agent={agent} />
                </td>
                <td className="text-right py-2 px-2">
                  <RateCell r={ratesByAgent?.get(agent.agent_id)?.standard} />
                </td>
                <td className="text-right py-2 px-2">
                  <RateCell r={ratesByAgent?.get(agent.agent_id)?.specialized} />
                </td>
                <td className="text-right py-2 px-2 text-dim tabular-nums">{card.loadCount}</td>
                <td className="text-right py-2 px-2 tabular-nums">{money(card.revenue)}</td>
                <td className="text-right py-2 px-2 text-dim text-xs whitespace-nowrap">
                  {shortDate(card.lastWorked)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
