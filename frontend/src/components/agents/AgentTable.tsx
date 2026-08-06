import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import type { Agent } from "@/types/agent";
import type { AgentScorecard } from "@/lib/metrics/agentScorecard";
import { money, rpm as fmtRpm } from "@/lib/format";
import {
  TIER_META,
  SPECIALTY_META,
  dwellStatus,
  DWELL_TONE,
  TREND_META,
} from "./agentDisplay";

export interface AgentRow {
  agent: Agent;
  card: AgentScorecard;
}

type SortKey = "goto" | "rate" | "dwell" | "loads" | "revenue" | "last" | "rating";

const COLS: { key: SortKey; label: string; l?: boolean }[] = [
  { key: "rating", label: "Rating" },
  { key: "goto", label: "Go-to" },
  { key: "rate", label: "$/mi" },
  { key: "dwell", label: "Dwell" },
  { key: "loads", label: "Loads" },
  { key: "revenue", label: "Rev" },
  { key: "last", label: "Last" },
];

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

const compare = (a: AgentRow, b: AgentRow, key: SortKey): number => {
  const A = a.card;
  const B = b.card;
  switch (key) {
    case "rate":
      return (B.medianRpm ?? -1) - (A.medianRpm ?? -1);
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

export const AgentTable = ({ rows }: { rows: AgentRow[] }) => {
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortKey>("goto");

  const sorted = useMemo(
    () => [...rows].sort((a, b) => compare(a, b, sort)),
    [rows, sort],
  );

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-sm border-collapse" style={{ minWidth: 680 }}>
        <thead>
          <tr>
            <th className="text-left font-normal text-[10px] uppercase tracking-wide text-muted-text py-2 px-2">
              Agent
            </th>
            {COLS.map((c) => (
              <th
                key={c.key}
                onClick={() => setSort(c.key)}
                className="text-right font-normal text-[10px] uppercase tracking-wide py-2 px-2 cursor-pointer select-none whitespace-nowrap hover:text-light"
                style={{ color: sort === c.key ? "#f5b03a" : undefined }}
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
                ? "linear-gradient(90deg,rgba(74,222,128,.06),transparent 45%)"
                : card.tier === "watch"
                  ? "linear-gradient(90deg,rgba(245,166,35,.05),transparent 45%)"
                  : undefined;
            return (
              <tr
                key={agent.agent_id}
                onClick={() => navigate(`/agents/${agent.agent_id}`)}
                className="cursor-pointer hover:bg-plate/40"
                style={{ background: tint, borderTop: "0.5px solid rgba(255,255,255,0.06)" }}
              >
                <td className="py-2 px-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-light truncate">
                      {agent.first_name} {agent.last_name}
                    </span>
                    {spec && (
                      <span
                        className="text-[8.5px] font-bold tracking-wide px-1.5 py-0.5 rounded"
                        style={{ color: spec.fg, background: spec.bg, border: `1px solid ${spec.border}` }}
                      >
                        {spec.label}
                      </span>
                    )}
                    {card.ratingFlag && (
                      <TriangleAlert size={12} style={{ color: "#f5a623", flexShrink: 0 }} />
                    )}
                  </div>
                </td>
                <td className="text-right py-2 px-2 whitespace-nowrap" style={{ color: "#f5b03a" }}>
                  {stars(agent.rating)}
                </td>
                <td className="text-right py-2 px-2">
                  <span
                    className="text-[9.5px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap"
                    style={{ color: tier.fg, background: tier.bg, border: `1px solid ${tier.border}` }}
                  >
                    {tier.label}
                  </span>
                </td>
                <td
                  className="text-right py-2 px-2 tabular-nums"
                  style={{ color: card.medianRpm != null && card.tier === "call-first" ? "#4ade80" : undefined }}
                >
                  {card.medianRpm != null ? fmtRpm(card.medianRpm) : "—"}
                </td>
                <td className="text-right py-2 px-2 whitespace-nowrap" style={{ color: DWELL_TONE[dwell.tone] }}>
                  {dwell.label}
                </td>
                <td className="text-right py-2 px-2 text-muted-text tabular-nums">{card.loadCount}</td>
                <td className="text-right py-2 px-2 tabular-nums">{money(card.revenue)}</td>
                <td className="text-right py-2 px-2 whitespace-nowrap">
                  {trend ? <span style={{ color: trend.fg }}>{trend.glyph}</span> : <span className="text-muted-text">·</span>}{" "}
                  <span className="text-muted-text text-xs">{shortDate(card.lastWorked)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
