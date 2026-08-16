import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Load } from "@/types/load";
import { useAgents } from "@/hooks/useAgents";
import {
  quarterStandings,
  quarterContenders,
  currentQuarterKey,
  lastCompleteQuarterKey,
  type BoardStanding,
} from "@/lib/metrics/agentLeaderboard";
import { money } from "@/lib/format";
import { ForgedPlate } from "@/components/ui/ForgedPlate";

// THE RACE — the quarter leaderboard plate, one component so the owner's
// Agents tab and the dispatch board can never drift (Jason, 2026-08-15: the
// dispatcher's leaderboard must be the same design and the same logic as the
// admin's). Self-contained: names resolve here, standings compute here.

const MEDAL = ["#f5b03a", "#c3ccd6", "#c78a3a"]; // gold · silver · bronze

// "2026-Q2" → "Q2 2026"
const qLabel = (q: string): string => q.split("-").reverse().join(" ");

const BoardRow = ({ s, label }: { s: BoardStanding; label: string }) => (
  <Link
    to={`/agents/${s.agentId}`}
    className="flex items-center gap-2.5 py-1.5 border-t first:border-t-0"
    style={{ borderColor: "#1a2233" }}
  >
    <span
      className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-extrabold flex-none"
      style={{ background: MEDAL[s.rank - 1] ?? "#5b6577", color: "#0d1119" }}
    >
      {s.rank}
    </span>
    <span className="flex-1 font-semibold text-light truncate">{label}</span>
    <span className="text-[10px] text-muted-text whitespace-nowrap">{s.loads} loads</span>
    <span className="font-bold whitespace-nowrap">{money(s.revenue)}</span>
  </Link>
);

export const RaceBoard = ({ loads }: { loads: Load[] }) => {
  const { agents } = useAgents();
  const now = useMemo(() => new Date(), []);
  const liveQ = currentQuarterKey(now);
  const lastQ = lastCompleteQuarterKey(now);
  const liveBoard = useMemo(() => quarterStandings(loads, liveQ), [loads, liveQ]);
  const liveContenders = useMemo(() => quarterContenders(loads, liveQ), [loads, liveQ]);
  const lastBoard = useMemo(() => quarterStandings(loads, lastQ), [loads, lastQ]);
  const byId = useMemo(
    () => new Map((agents ?? []).map((a) => [a.agent_id, a])),
    [agents],
  );
  const name = (id: string) => {
    const a = byId.get(id);
    return a ? `${a.first_name} ${a.last_name}` : "—";
  };

  return (
        <ForgedPlate chamfer tilt className="p-4">
          {lastBoard[0] && (
            <p className="mb-2">
              <span className="font-forge font-semibold text-[11px] tracking-[.14em] text-amber-hi">REIGNING CHAMP</span>{" "}
              <span className="font-condensed font-semibold text-[12.5px] text-ink">{name(lastBoard[0].agentId)} · {qLabel(lastQ)} · {money(lastBoard[0].revenue)}</span>
            </p>
          )}
          <h3 className="ds2-label mb-1.5 flex justify-between items-center">
            <span>The race · {qLabel(liveQ)}</span>
            <span className="inline-flex items-center gap-1.5 text-[9.5px]" style={{ color: "#f5a623" }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#f5a623" }} />
              LIVE
            </span>
          </h3>
          {liveBoard.length === 0 ? (
            <p className="text-[11.5px] text-muted-text">No one's hit 2 loads yet — the board opens at a second load.</p>
          ) : (
            liveBoard.slice(0, 3).map((s) => <BoardRow key={s.agentId} s={s} label={name(s.agentId)} />)
          )}
          {liveContenders.length > 0 && (
            <p className="text-[10.5px] text-muted-text mt-1.5">
              One more load to qualify: {liveContenders.slice(0, 3).map((c) => `${byId.get(c.agentId)?.last_name ?? "—"} ${money(c.revenue)}`).join(" · ")}
            </p>
          )}

          <h3 className="ds2-label mt-3 pt-2.5 mb-1.5 border-t border-white/10 flex justify-between items-center">
            <span>Last quarter · {qLabel(lastQ)}</span>
            <span className="normal-case tracking-normal font-normal text-[9.5px]">final</span>
          </h3>
          {lastBoard.length === 0 ? (
            <p className="text-[11.5px] text-muted-text">No qualifying agents last quarter.</p>
          ) : (
            lastBoard.slice(0, 3).map((s) => <BoardRow key={s.agentId} s={s} label={name(s.agentId)} />)
          )}
          <p className="text-[10px] text-muted-text mt-2">Top 3 earners by gross · 2+ loads to qualify · ties break on revenue per load. Formal trophies (each agent's page) use a stricter rule.</p>
        </ForgedPlate>
  );
};
