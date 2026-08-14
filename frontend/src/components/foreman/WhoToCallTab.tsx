import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useLoads } from "@/hooks/useLoads";
import { useAgents } from "@/hooks/useAgents";
import { useCityCoords } from "@/hooks/useCityCoords";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { ForgedPlate, Well } from "@/components/ui/ForgedPlate";
import {
  buildForemanBoard,
  distanceLabel,
  TYPE_LABELS,
  type AgentRanking,
  type ForemanMode,
  type LoadTypeFocus,
} from "@/lib/metrics/foreman";

const money2 = (n: number) => `$${n.toFixed(2)}`;

// The rate benchmark line: how the agent's $/mi compares to your realized median
// for the load type they're judged on.
const RateNote = ({ r }: { r: AgentRanking }) => {
  if (r.rpm == null)
    return <span className="text-faint">no {TYPE_LABELS[r.loadType].toLowerCase()} loads yet</span>;
  if (r.rateDelta == null || r.benchmark == null) return null;
  const up = r.rateDelta >= 0;
  return (
    <span style={{ color: up ? "#5dcaa5" : "#8494ab" }}>
      {up ? "+" : "−"}
      {money2(Math.abs(r.rateDelta)).slice(1)} vs your {TYPE_LABELS[r.loadType].toLowerCase()} avg
    </span>
  );
};

const historySub = (r: AgentRanking) => {
  if (r.daysSince == null) return "no delivered loads yet";
  const dwell = r.dwellLoads > 0 ? "detention owed" : "low dwell";
  return `last ${r.daysSince}d ago · ${dwell}`;
};

const originSub = (r: AgentRanking) => {
  if (!r.nearestOrigin) return "";
  const verb = r.regionFallback ? "sources out of" : "loads out of";
  return `${verb} ${r.nearestOrigin.city}, ${r.nearestOrigin.state}`;
};

// ---- the one forged plate: the top call ----
const TopCall = ({ r }: { r: AgentRanking }) => (
  <ForgedPlate chamfer tilt className="p-4 sm:p-5">
    <div className="flex items-center gap-2 mb-2">
      <span className="font-forge text-[12px] tracking-wider px-2.5 py-1 rounded-md bg-amber text-canvas font-bold">
        {"★"} TOP CALL
      </span>
      <span className="font-condensed text-[12px] font-semibold px-2 py-0.5 rounded-md bg-well text-hot">
        {TYPE_LABELS[r.loadType]}
      </span>
      {r.isNew && (
        <span className="font-condensed text-[11px] font-semibold px-2 py-0.5 rounded" style={{ color: "#5dcaa5", background: "rgba(53,160,140,.13)" }}>
          NEW
        </span>
      )}
      <span
        className="font-condensed text-[11px] font-semibold px-2 py-0.5 rounded"
        style={
          r.bucket === "direct"
            ? { color: "#5dcaa5", background: "rgba(93,202,165,.13)" }
            : { color: "#8494ab", background: "rgba(132,148,171,.10)" }
        }
      >
        {r.bucket === "direct" ? "DIRECT" : "SPOT"}
      </span>
    </div>

    <Link
      to={`/agents/${r.agentId}`}
      className="font-display text-[26px] text-amber leading-none hover:text-hot transition-colors"
    >
      {r.agentName}
    </Link>

    <div className="grid grid-cols-3 gap-3 mt-4 mb-3">
      <div>
        <p className="text-[11px] uppercase tracking-widest text-faint font-condensed">Proximity</p>
        <p className="font-display text-[24px] text-ink leading-none mt-1">{distanceLabel(r)}</p>
        <p className="text-[12px] text-dim mt-1">{originSub(r)}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-widest text-faint font-condensed">Rate</p>
        <p className="font-display text-[24px] text-ink leading-none mt-1">
          {r.rpm != null ? money2(r.rpm) : "—"}
          {r.rpm != null && <span className="font-condensed text-[13px] text-dim"> /mi gross</span>}
        </p>
        <p className="text-[12px] mt-1"><RateNote r={r} /></p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-widest text-faint font-condensed">History</p>
        <p className="font-display text-[24px] text-ink leading-none mt-1">
          {r.loadCount} load{r.loadCount === 1 ? "" : "s"}
        </p>
        <p className="text-[12px] text-dim mt-1">{historySub(r)}</p>
      </div>
    </div>

    <Well className="px-3 py-2.5 flex items-center gap-3">
      <span className="text-[11px] uppercase tracking-widest text-amber font-condensed shrink-0">Why</span>
      <span className="text-[13.5px] text-ink/90">{r.why}</span>
    </Well>
  </ForgedPlate>
);

// ---- flat reading rows: #2..N ----
const AgentRow = ({ r, rank }: { r: AgentRanking; rank: number }) => (
  <div className="grid items-center gap-3 px-3.5 py-3 border-t border-hairline-lo" style={{ gridTemplateColumns: "20px 1.4fr 80px 72px 92px" }}>
    <span className="font-display text-[17px] text-faint">{rank}</span>
    <div className="min-w-0">
      <Link to={`/agents/${r.agentId}`} className="font-condensed text-[15px] text-amber hover:text-hot transition-colors">
        {r.agentName}
      </Link>
      <div className="text-[11.5px] truncate">
        {r.isNew ? (
          <span className="font-condensed font-semibold uppercase tracking-wide" style={{ color: "#5dcaa5" }}>
            New {"·"} building
          </span>
        ) : (
          <span className="text-dim">{originSub(r)}</span>
        )}
      </div>
    </div>
    <span className="font-display text-[17px] text-ink text-right">{distanceLabel(r)}</span>
    <span className="font-display text-[17px] text-right" >{r.rpm != null ? money2(r.rpm) : <span className="text-faint">{"—"}</span>}</span>
    <span className="font-condensed text-[13px] text-dim text-right">
      {r.loadCount} load{r.loadCount === 1 ? "" : "s"}
      {r.daysSince != null ? ` · ${r.daysSince}d` : ""}
    </span>
  </div>
);

// A labeled tier of rows (Direct customers / Spot market). Hidden when empty.
const RankGroup = ({
  label,
  hint,
  rows,
  startRank,
  tone,
}: {
  label: string;
  hint: string;
  rows: AgentRanking[];
  startRank: number;
  tone: "direct" | "spot";
}) => {
  if (rows.length === 0) return null;
  return (
    <div className="ds2-board mt-3">
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-1">
        <span
          className="text-[12px] font-bold uppercase tracking-[.09em]"
          style={{ color: tone === "direct" ? "#5dcaa5" : "#8494ab" }}
        >
          {label}
        </span>
        <span className="text-[11px] text-faint">{hint}</span>
      </div>
      <div className="grid gap-3 px-3.5 pt-1 pb-1.5" style={{ gridTemplateColumns: "20px 1.4fr 80px 72px 92px" }}>
        <span />
        <span className="text-[11px] uppercase tracking-widest text-faint font-condensed">Agent</span>
        <span className="text-[11px] uppercase tracking-widest text-faint font-condensed text-right">Away</span>
        <span className="text-[11px] uppercase tracking-widest text-faint font-condensed text-right">$/mi</span>
        <span className="text-[11px] uppercase tracking-widest text-faint font-condensed text-right">History</span>
      </div>
      {rows.map((r, i) => (
        <AgentRow key={r.agentId} r={r} rank={startRank + i} />
      ))}
    </div>
  );
};

const FOCUS_TABS: { value: LoadTypeFocus; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "standard flatbed", label: "Flatbed" },
  { value: "oversize", label: "Oversize" },
  { value: "hazmat", label: "Hazmat" },
  { value: "heavy haul", label: "Heavy" },
];
const MODE_TABS: { value: ForemanMode; label: string }[] = [
  { value: "balanced", label: "Balanced" },
  { value: "closest", label: "Closest" },
  { value: "best-rate", label: "Best rate" },
];

const Loading = () => (
  <div className="space-y-3">
    <div className="ds2-board h-14 animate-pulse" />
    <div className="ds2-forged h-40 animate-pulse" />
    <div className="ds2-board h-52 animate-pulse" />
  </div>
);

const Empty = ({ msg }: { msg: string }) => (
  <div className="ds2-board p-8 text-center text-dim">{msg}</div>
);

export const WhoToCallTab = () => {
  const { loads, isLoading: loadsLoading } = useLoads(0);
  const { agents, isLoading: agentsLoading } = useAgents();
  const coords = useCityCoords(loads);

  const [focus, setFocus] = useState<LoadTypeFocus>("any");
  const [mode, setMode] = useState<ForemanMode>("balanced");

  const board = useMemo(
    () => buildForemanBoard(loads, agents, coords, { focus, mode }),
    [loads, agents, coords, focus, mode],
  );

  if (loadsLoading || agentsLoading) return <Loading />;
  if (!board.anchor)
    return <Empty msg="No committed or delivered loads yet — add a load and the Foreman will tell you who to call." />;

  const [top, ...rest] = board.rankings;
  const restDirect = rest.filter((r) => r.bucket === "direct");
  const restSpot = rest.filter((r) => r.bucket === "spot");
  const anchorHint =
    board.anchor.source === "committed" ? "after your booked load delivers" : "empty here now";

  return (
    <div>
      {/* controls */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-faint font-condensed">Looking for</span>
          <SegmentedTabs size="sm" tabs={FOCUS_TABS} value={focus} onChange={setFocus} ariaLabel="Load type focus" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-faint font-condensed">Rank by</span>
          <SegmentedTabs size="sm" tabs={MODE_TABS} value={mode} onChange={setMode} ariaLabel="Rank by" />
        </div>
      </div>

      {/* anchor */}
      <div className="ds2-board flex items-center gap-3 px-4 py-3 mb-4">
        <span className="text-amber text-[15px]">{"◉"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-faint font-condensed">Empty next</p>
          <p className="font-condensed text-[18px] font-semibold text-ink leading-tight">
            {board.anchor.city}, {board.anchor.state}
            <span className="text-dim font-normal text-[12px] ml-2">{anchorHint}</span>
          </p>
        </div>
      </div>

      {board.rankings.length === 0 ? (
        <Empty
          msg={
            focus === "any"
              ? "No agents to rank yet — book a load and they'll show up here."
              : `You haven't booked ${TYPE_LABELS[focus].toLowerCase()} freight yet — switch to "Any" to see everyone.`
          }
        />
      ) : (
        <>
          {/* top call */}
          {top && <TopCall r={top} />}

          {/* remaining agents, bucketed — direct always above spot */}
          <RankGroup label="Direct customers" hint="your own — call first" rows={restDirect} startRank={2} tone="direct" />
          <RankGroup label="Spot market" hint="only if nothing direct fits" rows={restSpot} startRank={2 + restDirect.length} tone="spot" />

          {/* footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3 px-1">
            <p className="text-[11.5px] text-faint max-w-xl">
              Ranked on straight-line distance to where you'll be empty, your gross $/mi within load type,
              and your history — a call list from who you've booked, not a live load feed.
              {board.coverage.withCoords < board.coverage.total &&
                " Distances sharpen to real miles as new cities finish geocoding."}
            </p>
            <Link to="/guide" className="font-condensed text-[12.5px] text-dim hover:text-ink whitespace-nowrap">
              How it's ranked {"→"}
            </Link>
          </div>
        </>
      )}
    </div>
  );
};
