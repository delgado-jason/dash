import { useMemo } from "react";
import { Link } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import type { Load } from "@/types/load";
import { useAgents } from "@/hooks/useAgents";
import {
  buildAgentScorecards,
  agentRosterAnalytics,
  concentrationAnalytics,
  agentMomentum,
  MIN_SCORE_LOADS,
} from "@/lib/metrics/agentScorecard";
import { currentQuarterStandings, quarterKey } from "@/lib/metrics/agentLeaderboard";
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

const MomBar = ({ pct }: { pct: number | null }) => {
  if (pct == null) return <div className="h-4" />;
  const up = pct >= 0;
  const w = Math.min(48, Math.abs(pct) * 50);
  return (
    <div className="relative h-4 rounded" style={{ background: "#0c1119", border: "1px solid #1c2536" }}>
      <div className="absolute top-0 bottom-0" style={{ left: "50%", width: 1, background: "#2f3b52" }} />
      <div
        className="absolute top-[2px] bottom-[2px]"
        style={
          up
            ? { left: "50%", width: `${w}%`, background: "#2f7d55", borderRadius: "0 3px 3px 0" }
            : { right: "50%", width: `${w}%`, background: "#8a3b3b", borderRadius: "3px 0 0 3px" }
        }
      />
    </div>
  );
};

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
  const momentum = useMemo(() => agentMomentum(loads, now), [loads, now]);
  const standings = useMemo(() => currentQuarterStandings(loads, now), [loads, now]);
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

  // momentum: top agents by revenue that have a reading
  const momRows = useMemo(
    () =>
      rows
        .filter((r) => r.card.loadCount >= MIN_SCORE_LOADS && momentum.get(r.agent.agent_id) != null)
        .sort((a, b) => b.card.revenue - a.card.revenue)
        .slice(0, 6),
    [rows, momentum],
  );

  const board = useMemo(
    () =>
      [...standings.entries()]
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 3),
    [standings],
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
  const RANK = ["#f5b03a", "#c3ccd6", "#c78a3a"];
  const topShares = conc.shares.slice(0, 3);
  const elseShare = Math.max(0, 1 - topShares.reduce((s, x) => s + x.share, 0));

  return (
    <div className="flex flex-col gap-3 lg:flex-1 lg:min-h-0">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-condensed text-light">Your agent bench</h2>
        <span className="text-xs text-muted-text">
          who pays · who volumes · who to call — {quarterKey(now.toISOString())}
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
      <div className="rounded-xl p-3 flex flex-col lg:flex-1 lg:min-h-0" style={C.card}>
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

      {/* momentum + live board */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl p-3.5" style={C.card}>
          <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-2.5">
            Momentum — last 90d vs prior
          </h3>
          {momRows.length === 0 ? (
            <p className="text-xs text-muted-text">Not enough recent history to trend yet.</p>
          ) : (
            momRows.map(({ agent, card }) => {
              const pct = momentum.get(agent.agent_id)!;
              const up = (pct ?? 0) >= 0;
              return (
                <div key={agent.agent_id} className="grid items-center gap-2 py-[3px]" style={{ gridTemplateColumns: "108px 1fr 46px" }}>
                  <span className="text-[11.5px] truncate">
                    {agent.first_name.charAt(0)}. {agent.last_name}
                    {card.specialty.tag !== "standard" && <> <Badge tag={card.specialty.tag} /></>}
                  </span>
                  <MomBar pct={pct} />
                  <span className="text-[11px] font-bold text-right" style={{ color: up ? "#4ade80" : "#f87171" }}>
                    {up ? "+" : "−"}
                    {Math.round(Math.abs(pct ?? 0) * 100)}%
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="rounded-xl p-3.5" style={C.card}>
          <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-2.5 flex justify-between">
            Live board · {quarterKey(now.toISOString())}
            <span className="inline-flex items-center gap-1.5 text-[9.5px]" style={{ color: "#f5a623" }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#f5a623" }} />
              LIVE
            </span>
          </h3>
          {board.length === 0 ? (
            <p className="text-xs text-muted-text">No delivered loads this quarter yet.</p>
          ) : (
            board.map(([id, s], i) => (
              <Link
                key={id}
                to={`/agents/${id}`}
                className="flex items-center gap-2.5 py-1.5 border-t first:border-t-0"
                style={{ borderColor: "#1a2233" }}
              >
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-extrabold" style={{ background: RANK[i], color: "#0d1119" }}>
                  {i + 1}
                </span>
                <span className="flex-1 font-semibold text-light truncate">{name(id)}</span>
                <span className="font-bold">{money(s.revenue)}</span>
              </Link>
            ))
          )}
          <p className="text-[10.5px] text-muted-text mt-2">Provisional — the board agents earn medals on, not yet official.</p>
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
