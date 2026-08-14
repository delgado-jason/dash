import { Link } from "react-router";
import { TriangleAlert } from "lucide-react";
import type { Agent } from "@/types/agent";
import type {
  AgentHonors,
  AgentStat,
  LiveStanding,
} from "@/lib/metrics/agentLeaderboard";
import { effectiveAgentClass, type AgentScorecard } from "@/lib/metrics/agentScorecard";
import { agentPrestige } from "@/lib/metrics/agentLeaderboard";
import { RatingMedallion } from "./RatingMedallion";
import { PRESTIGE_META } from "./PrestigeBadge";
import { Coin, type CoinMetal } from "@/components/forge/Coin";
import {
  TIER_META,
  SPECIALTY_META,
  dwellStatus,
  DWELL_TONE,
  flagText,
} from "./agentDisplay";
import { money, rpm as fmtRpm } from "@/lib/format";

// Short live blurb — only shown when the agent is currently on the board this
// quarter, so it stays a highlight rather than clutter.
const liveBlurb = (live: LiveStanding): string | null => {
  if (live.result === "gold") return "leading this quarter";
  if (live.result === "silver") return "running 2nd this quarter";
  if (live.result === "board") return `#${live.boardRank} this quarter`;
  return null;
};

const fmtDate = (d: string | null) =>
  d
    ? new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";

export const AgentCard = ({
  agent,
  stats,
  honors,
  live,
  card,
  carrierName,
  onSetClass,
}: {
  agent: Agent;
  stats?: AgentStat;
  honors?: AgentHonors;
  live?: LiveStanding | null;
  card?: AgentScorecard;
  carrierName?: string;
  // Set/clear the relationship-bucket override (null = back to auto).
  onSetClass?: (value: "direct" | "spot" | null) => void;
}) => {
  const tier = agentPrestige(honors);
  const blurb = live ? liveBlurb(live) : null;
  const spec =
    card && card.specialty.tag !== "standard" ? SPECIALTY_META[card.specialty.tag] : null;
  const goto = card ? TIER_META[card.tier] : null;
  const dwell = card ? dwellStatus(card) : null;
  const flag = card ? flagText(card) : null;
  const cls = effectiveAgentClass(agent, card);
  const direct = cls.bucket === "direct";

  return (
    <Link
      to={`/agents/${agent.agent_id}`}
      className="relative overflow-hidden block ds2-board p-3.5 hover:border-amber/60 transition-colors"
    >
      {PRESTIGE_META[tier].label && (
        <span
          className="absolute top-2.5 right-2.5"
          title={`${PRESTIGE_META[tier].label} agent`}
        >
          <Coin
            metal={
              ({ contender: "bronze", "all-star": "silver", champion: "gold", legend: "platinum" } as Record<string, CoinMetal>)[tier] ?? "bronze"
            }
            size={26}
          >
            {agent.first_name.charAt(0)}
          </Coin>
        </span>
      )}

      <div className="flex gap-3 items-center">
        <div className="size-11 rounded-full bg-well border-2 border-amber flex items-center justify-center font-condensed font-semibold text-lg text-amber-light shrink-0">
          {agent.first_name.charAt(0)}
          {agent.last_name.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="font-condensed text-lg leading-tight truncate">
              {agent.first_name} {agent.last_name}
            </p>
            {spec && (
              <span
                className="text-[8.5px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0"
                style={{ color: spec.fg, background: spec.bg, border: `1px solid ${spec.border}` }}
              >
                {spec.label}
              </span>
            )}
          </div>
          <p className="text-xs text-dim truncate">
            {agent.broker_name}
            {carrierName ? ` · ${carrierName}` : ""}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2.5">
        <RatingMedallion rating={agent.rating} />
        {goto && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0"
            style={{ color: goto.fg, background: goto.bg, border: `1px solid ${goto.border}` }}
          >
            {goto.label}
          </span>
        )}
      </div>

      {/* relationship bucket + override */}
      <div className="flex items-center justify-between gap-2 mt-2">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0"
          style={
            direct
              ? { color: "#5dcaa5", background: "rgba(93,202,165,.12)", border: "1px solid rgba(93,202,165,.40)" }
              : { color: "#8494ab", background: "rgba(132,148,171,.08)", border: "1px solid rgba(132,148,171,.28)" }
          }
          title={cls.source === "pinned" ? "Pinned by you" : "Auto — from a repeat shipper or receiver"}
        >
          {direct ? "Direct" : "Spot"}
          <span className="ml-1 font-normal opacity-70">
            {cls.source === "pinned" ? "pinned" : "auto"}
          </span>
        </span>
        {onSetClass && (
          <div className="flex rounded-md overflow-hidden border ds2-cell-rule text-[9px] font-semibold uppercase tracking-wide">
            {([["Auto", null], ["Direct", "direct"], ["Spot", "spot"]] as const).map(
              ([lbl, val]) => {
                const active = (agent.agent_class ?? null) === val;
                return (
                  <button
                    key={lbl}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSetClass(val);
                    }}
                    className="px-1.5 py-[3px] transition-colors"
                    style={
                      active
                        ? { color: "#5dcaa5", background: "rgba(93,202,165,.13)" }
                        : { color: "#5a6880" }
                    }
                  >
                    {lbl}
                  </button>
                );
              },
            )}
          </div>
        )}
      </div>

      {flag && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: "#f5a623" }}>
          <TriangleAlert size={12} className="shrink-0" />
          <span>{flag}</span>
        </div>
      )}

      {blurb && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
          <span className="text-amber font-medium">LIVE</span>
          <span className="text-dim">{blurb}</span>
        </div>
      )}

      <div className="mt-2.5 pt-2 border-t ds2-cell-rule text-xs">
        <div className="flex items-center justify-between">
          <span className="text-dim">
            {stats?.loadCount ?? 0} loads · {money(stats?.revenue ?? 0)}
          </span>
          <span className="font-medium">
            {card?.medianRpm != null ? `${fmtRpm(card.medianRpm)}/mi` : ""}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1 text-[11px]">
          {dwell ? (
            <span style={{ color: DWELL_TONE[dwell.tone] }}>dwell: {dwell.label}</span>
          ) : (
            <span />
          )}
          <span className="text-dim">{fmtDate(stats?.lastWorked ?? null)}</span>
        </div>
      </div>
    </Link>
  );
};
