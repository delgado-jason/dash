import { useMemo } from "react";
import { Link } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import type { Load } from "@/types/load";
import { useAgents } from "@/hooks/useAgents";
import {
  buildAgentScorecards,
  agentRosterAnalytics,
  concentrationAnalytics,
} from "@/lib/metrics/agentScorecard";
import {
  quarterStandings,
  quarterContenders,
  currentQuarterKey,
  lastCompleteQuarterKey,
  type BoardStanding,
} from "@/lib/metrics/agentLeaderboard";
import { SPECIALTY_META, flagText } from "@/components/agents/agentDisplay";
import { money, rpm as fmtRpm } from "@/lib/format";
import { AgentScatter, type ScatterPoint } from "./AgentScatter";

const C = {
  card: { background: "#0f1622", border: "1px solid #26304a" },
  tile: { background: "#121a27", border: "1px solid #26304a" },
};

const KpiTile = ({
  label,
  value,
  sub,
  valueColor,
  warn,
}: {
  label: string;
  value: string;
  sub: string;
  valueColor?: string;
  warn?: boolean;
}) => (
  <div
    className="rounded-xl px-3.5 py-3"
    style={warn ? { background: "#1c1408", border: "1px solid #7a3b12" } : C.tile}
  >
    <p className="text-[10px] uppercase tracking-wide text-muted-text">{label}</p>
    <p className="text-lg font-bold mt-0.5 leading-tight" style={{ color: valueColor }}>
      {value}
    </p>
    <p className="text-[10.5px] text-muted-text mt-0.5">{sub}</p>
  </div>
);

const FRESH = (d: number | null): string =>
  d == null ? "#8b93a3" : d <= 14 ? "#4ade80" : d <= 45 ? "#f5b03a" : "#8b93a3";

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

const Badge = ({ tag }: { tag: "oversize" | "specialty" }) => {
  const m = SPECIALTY_META[tag];
  return (
    <span
      className="text-[8px] font-bold tracking-wide px-1.5 py-0.5 rounded"
      style={{ color: m.fg, background: m.bg, border: `1px solid ${m.border}` }}
    >
      {tag === "oversize" ? "OVR" : "SPEC"}
    </span>
  );
};

export const AgentsTab = ({ loads }: { loads: Load[] }) => {
  const { agents } = useAgents();
  const now = useMemo(() => new Date(), []);

  const scorecards = useMemo(
    () => buildAgentScorecards(agents ?? [], loads, now),
    [agents, loads, now],
  );
  const roster = useMemo(() => agentRosterAnalytics(scorecards), [scorecards]);
  const conc = useMemo(() => concentrationAnalytics(loads, now), [loads, now]);
  const liveQ = currentQuarterKey(now);
  const lastQ = lastCompleteQuarterKey(now);
  const liveBoard = useMemo(() => quarterStandings(loads, liveQ), [loads, liveQ]);
  const liveContenders = useMemo(() => quarterContenders(loads, liveQ), [loads, liveQ]);
  const lastBoard = useMemo(() => quarterStandings(loads, lastQ), [loads, lastQ]);
  const byId = useMemo(
    () => new Map((agents ?? []).map((a) => [a.agent_id, a])),
    [agents],
  );

  const rows = useMemo(
    () =>
      (agents ?? [])
        .map((a) => ({ agent: a, card: scorecards.get(a.agent_id)! }))
        .filter((r) => r.card),
    [agents, scorecards],
  );
  const scatterPoints: ScatterPoint[] = rows;

  const name = (id: string) => {
    const a = byId.get(id);
    return a ? `${a.first_name} ${a.last_name}` : "—";
  };

  // "Running with lately" — recent 90-day gross per agent (from the concentration
  // window), joined to their days-since-last-load. Sorted by recency: who you're
  // actually working with now, newest at the top. The quiet ones are the "going
  // cold" card's job, so this stays the active bench.
  const rev90 = useMemo(
    () => new Map(conc.shares.map((s) => [s.agentId, s.revenue])),
    [conc],
  );
  const recentRows = useMemo(
    () =>
      rows
        // Within the 90-day window this card is scoped to (matches the "90d $"
        // header, and guarantees a real recent-$). Quieter agents are the "going
        // cold" card's job, so they don't show here as a stale $0 row.
        .filter((r) => r.card.daysSince != null && r.card.daysSince <= 90)
        .sort((a, b) => (a.card.daysSince ?? 0) - (b.card.daysSince ?? 0))
        .slice(0, 6),
    [rows],
  );

  const cold = useMemo(
    () =>
      rows
        .filter((r) => r.card.tier === "cold")
        .sort((a, b) => b.card.revenue - a.card.revenue)
        .slice(0, 4),
    [rows],
  );

  const flags = useMemo(() => rows.filter((r) => r.card.ratingFlag), [rows]);

  const rateLeader = roster.rateLeader ? byId.get(roster.rateLeader.agentId) : null;
  const coldTop = roster.goingCold ? byId.get(roster.goingCold.agentId) : null;
  const topShares = conc.shares.slice(0, 3);
  const elseShare = Math.max(0, 1 - topShares.reduce((s, x) => s + x.share, 0));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-condensed text-light">Your agent bench</h2>
        <span className="text-xs text-muted-text">
          who pays · who volumes · who to call
        </span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiTile
          label="Rate leader"
          value={roster.rateLeader ? `${fmtRpm(roster.rateLeader.medianRpm)}/mi` : "—"}
          valueColor="#4ade80"
          sub={rateLeader ? `${rateLeader.first_name} ${rateLeader.last_name}` : "need 2+ loads"}
        />
        <KpiTile
          label="Oversize bench"
          value={String(roster.oversizeBench)}
          valueColor="#f5b03a"
          sub={`specialists · ${roster.specCapable} spec-capable`}
        />
        <KpiTile
          label="Concentration"
          value={conc.top3Pct != null ? `${Math.round(conc.top3Pct * 100)}%` : "—"}
          valueColor={conc.overSingleCap ? "#f5a623" : undefined}
          warn={conc.overSingleCap}
          sub={
            conc.overSingleCap && conc.singleMax
              ? `⚠ ${byId.get(conc.singleMax.agentId)?.last_name ?? "one"} ${Math.round(conc.singleMax.share * 100)}% — over 30%`
              : "top 3 · last 90 days"
          }
        />
        <KpiTile
          label="Going cold"
          value={coldTop ? `${coldTop.first_name.charAt(0)}. ${coldTop.last_name}` : "—"}
          valueColor={coldTop ? "#f5a623" : undefined}
          warn={!!coldTop}
          sub={
            roster.goingCold
              ? `${money(roster.goingCold.revenue)} · ${roster.goingCold.daysSince}d quiet`
              : "all recently active"
          }
        />
      </div>

      {/* hero scatter */}
      <div className="rounded-xl p-3" style={C.card}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[13px] font-bold text-light">Who to call — rate × volume</span>
          <span className="text-[11px] text-muted-text">bubble = revenue · click to open an agent</span>
        </div>
        <AgentScatter points={scatterPoints} />
        <div className="flex gap-3.5 text-[10.5px] text-muted-text mt-1">
          <span><span className="inline-block w-2.5 h-2.5 rounded-full mr-1 align-[-1px]" style={{ background: "#e8940a" }} />Oversize</span>
          <span><span className="inline-block w-2.5 h-2.5 rounded-full mr-1 align-[-1px]" style={{ background: "#5fd0e0" }} />Specialty</span>
          <span>◯ dashed = cold · ⚠ = gut≠data</span>
        </div>
      </div>

      {/* running-lately + quarterly board */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl p-3.5" style={C.card}>
          <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-2.5 flex justify-between items-center">
            Running with lately
            <span className="normal-case tracking-normal font-normal text-muted-text">last worked · 90d $</span>
          </h3>
          {recentRows.length === 0 ? (
            <p className="text-xs text-muted-text">No delivered loads in the last 90 days.</p>
          ) : (
            recentRows.map(({ agent, card }) => (
              <Link
                key={agent.agent_id}
                to={`/agents/${agent.agent_id}`}
                className="grid items-center gap-2 py-[5px] border-t first:border-t-0"
                style={{ gridTemplateColumns: "1fr 62px 66px", borderColor: "#1a2233" }}
              >
                <span className="text-[12px] truncate flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: FRESH(card.daysSince) }} />
                  {agent.first_name} {agent.last_name}
                  {card.specialty.tag !== "standard" && <Badge tag={card.specialty.tag} />}
                </span>
                <span className="text-[11px] text-right" style={{ color: FRESH(card.daysSince) }}>
                  {card.daysSince}d ago
                </span>
                <span className="text-[11.5px] font-semibold text-right">{money(rev90.get(agent.agent_id) ?? 0)}</span>
              </Link>
            ))
          )}
        </div>

        <div className="rounded-xl p-3.5" style={C.card}>
          <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-1.5 flex justify-between items-center">
            <span>This quarter · {qLabel(liveQ)}</span>
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

          <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mt-3 pt-2.5 mb-1.5 border-t flex justify-between items-center" style={{ borderColor: "#1a2233" }}>
            <span>Last quarter · {qLabel(lastQ)}</span>
            <span className="normal-case tracking-normal font-normal text-[9.5px]">final</span>
          </h3>
          {lastBoard.length === 0 ? (
            <p className="text-[11.5px] text-muted-text">No qualifying agents last quarter.</p>
          ) : (
            lastBoard.slice(0, 3).map((s) => <BoardRow key={s.agentId} s={s} label={name(s.agentId)} />)
          )}
          <p className="text-[10px] text-muted-text mt-2">Top 3 earners by gross · 2+ loads to qualify · ties break on revenue per load. Formal trophies (each agent's page) use a stricter rule.</p>
        </div>
      </div>

      {/* concentration + going cold + gut-vs-data */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-xl p-3.5" style={C.card}>
          <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-2.5">Revenue concentration · 90d</h3>
          {conc.total > 0 ? (
            <>
              <div className="flex h-6 rounded-md overflow-hidden mb-2" style={{ border: "1px solid #26304a" }}>
                {topShares.map((s, i) => (
                  <div key={s.agentId} className="h-full flex items-center justify-center text-[9px] font-bold" style={{ width: `${s.share * 100}%`, background: ["#e8940a", "#f5b03a", "#c8890a"][i], color: "#0d1119" }}>
                    {Math.round(s.share * 100)}%
                  </div>
                ))}
                <div className="h-full flex items-center justify-center text-[9px]" style={{ width: `${elseShare * 100}%`, background: "#2a3347", color: "#9aa4b5" }}>
                  rest
                </div>
              </div>
              <div className="flex flex-wrap gap-x-3.5 gap-y-1 mb-2">
                {topShares.map((s, i) => (
                  <Link key={s.agentId} to={`/agents/${s.agentId}`} className="text-[11.5px] flex items-center gap-1.5 hover:underline">
                    <span className="inline-block w-2 h-2 rounded-sm flex-none" style={{ background: ["#e8940a", "#f5b03a", "#c8890a"][i] }} />
                    <span className="text-light">{name(s.agentId)}</span>
                    <span className="text-muted-text">{Math.round(s.share * 100)}%</span>
                  </Link>
                ))}
              </div>
              <p className="text-[11px] text-muted-text">
                Top 3 = <b style={{ color: conc.overSingleCap ? "#f5a623" : "#f5b03a" }}>{Math.round((conc.top3Pct ?? 0) * 100)}%</b> of your recent book.
                Rule of thumb: no single agent over <span className="text-light">30%</span>, top 3 under <span className="text-light">65%</span>.
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-text">No delivered revenue in the last 90 days.</p>
          )}
        </div>

        <div className="rounded-xl p-3.5" style={C.card}>
          <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-2.5">Going cold — worth a call</h3>
          {cold.length === 0 ? (
            <p className="text-xs text-muted-text">Everyone's been active lately.</p>
          ) : (
            cold.map(({ agent, card }) => (
              <Link key={agent.agent_id} to={`/agents/${agent.agent_id}`} className="flex items-center justify-between py-1.5 text-[12px] border-t first:border-t-0" style={{ borderColor: "#1a2233" }}>
                <span className="truncate">
                  {agent.first_name} {agent.last_name}
                  {card.specialty.tag !== "standard" && <> <Badge tag={card.specialty.tag} /></>}
                </span>
                <span style={{ color: "#f5a623" }} className="whitespace-nowrap">
                  {card.daysSince}d · {money(card.revenue)}
                </span>
              </Link>
            ))
          )}
        </div>

        <div className="rounded-xl p-3.5" style={C.card}>
          <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-2.5">Gut vs. data ⚠</h3>
          {flags.length === 0 ? (
            <p className="text-xs text-muted-text">Your star ratings track the numbers — nothing to flag.</p>
          ) : (
            flags.slice(0, 4).map(({ agent, card }) => (
              <Link key={agent.agent_id} to={`/agents/${agent.agent_id}`} className="flex gap-2 items-start py-1.5 text-[11.5px] border-t first:border-t-0" style={{ borderColor: "#1a2233" }}>
                <TriangleAlert size={13} style={{ color: "#f5a623", flexShrink: 0, marginTop: 1 }} />
                <span>
                  <span className="font-semibold">{agent.first_name} {agent.last_name}</span> — {flagText(card)}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
