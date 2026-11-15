import { Link } from "react-router-dom";
import type { Agent } from "@/types/agent";
import type { AgentNote } from "@/types/agentNote";
import type { AgentScorecard } from "@/lib/metrics/agentScorecard";
import { agentCode, agentFullName } from "@/lib/agentMatch";
import { standingIsContradictory, standingOf } from "@/lib/agents/standing";
import { RatingLabel } from "@/components/agents/RatingLabel";
import { formatPhone, telHref } from "@/lib/phone";
import { rpm as fmtRpm } from "@/lib/format";

// THE DESK, beside the load (the Score a Load sheet, Call 4 and the drawing):
// the brief fills in AS THE CODE RESOLVES, not after the verdict — the
// standing, the history, the phone, the latest dated notes — because a brief
// you read after deciding is decoration. A parked desk replaces the whole
// block with the banner and the reason you wrote.
//
// A desk is measured by its rating and the parked flag, nothing else. There is
// no tier on it and none will be read here (Jason, 2026-11-15: "make sure
// that only the rating system is used, not the tier system").
export interface DeskNotes {
  notes: AgentNote[] | null; // null while loading
  failed: boolean; // the fetch failed — said on the brief, never shown as "no notes"
}

const LATEST = 3;

const classWord = (c: Agent["agent_class"]): string | null =>
  c === "direct" ? "direct customer" : c === "spot" ? "spot freight" : null;

// created_at is a timestamp, so the viewer's own day is the honest one.
const noteDay = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const Label = ({ children }: { children: string }) => (
  <p className="font-condensed uppercase tracking-widest text-[10.5px] text-faint">{children}</p>
);

export const DeskBrief = ({
  agent,
  isNew,
  card,
  desk,
}: {
  agent: Agent | null;
  isNew: boolean; // the typed code matches nobody — a real answer, not a blank
  card?: AgentScorecard;
  desk: DeskNotes;
}) => {
  if (!agent) {
    return isNew ? (
      <div className="text-[13.5px] text-dim" data-testid="desk-new">
        <span
          className="font-condensed font-semibold text-[12px] tracking-[.08em] uppercase mr-1.5"
          style={{ color: "var(--color-cat2)" }}
        >
          New agent
        </span>
        No history yet — the rate scores on its own; the desk is saved once you book a load with it.
      </div>
    ) : (
      <p className="text-[13px] text-faint" data-testid="desk-empty">
        Type the agency code and the desk fills in here — the rating, the history, the phone, the latest
        notes.
      </p>
    );
  }

  const name = agentFullName(agent);
  const code = agentCode(agent);
  const standing = standingOf(agent);

  if (standing === "parked") {
    return (
      <div
        className="rounded-lg p-3.5"
        style={{
          borderLeft: "3px solid var(--color-status-negative-text)",
          background: "var(--color-status-negative-bg)",
        }}
        data-testid="desk-parked"
      >
        <Label>⛔ Do not book</Label>
        <p className="text-[15.5px] text-ink font-medium mt-0.5">
          {code ? `${code} · ` : ""}
          {name} is parked
          {agent.park_reason?.trim() ? ` — "${agent.park_reason.trim()}"` : "."}
        </p>
        <p className="mt-1.5">
          <RatingLabel rating={agent.rating} workStatus={agent.work_status} />
        </p>
        <Link
          to={`/agents/${agent.agent_id}`}
          className="inline-block mt-2 font-condensed font-semibold text-[12.5px] text-amber-hi tracking-[.05em]"
        >
          Open the desk →
        </Link>
      </div>
    );
  }

  const agency = agent.agency_name?.trim();
  const kind = classWord(agent.agent_class);
  const latest =
    desk.notes == null
      ? null
      : [...desk.notes].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, LATEST);

  return (
    <div data-testid="desk-brief">
      <Link to={`/agents/${agent.agent_id}`} className="font-condensed text-[17.5px] text-amber hover:text-hot">
        {code ? `${code} · ` : ""}
        {name}
      </Link>
      {(agency || kind) && <p className="text-[13px] text-dim">{[agency, kind].filter(Boolean).join(" · ")}</p>}
      <p className="mt-1.5 flex items-baseline gap-1.5 flex-wrap">
        <RatingLabel rating={agent.rating} workStatus={agent.work_status} />
        <span className="font-condensed text-[12.5px] text-dim">· working</span>
        {standingIsContradictory(agent) && (
          <span className="font-condensed text-[12.5px] text-amber-hi">· rated worst but not parked</span>
        )}
      </p>
      <p className="text-[13.5px] text-dim mt-1.5 leading-relaxed">
        {card && card.loadCount > 0 ? (
          <>
            {card.loadCount} load{card.loadCount === 1 ? "" : "s"} together
            {card.medianRpm != null ? ` · ${fmtRpm(card.medianRpm)}/mi median` : ""}
            {card.daysSince != null ? ` · last ${card.daysSince}d ago` : ""}
            {card.moneyLostLoads > 0 ? " · detention owed" : ""}
          </>
        ) : (
          "No delivered history yet with this desk."
        )}
      </p>
      <p className="text-[13px] text-ink mt-1.5 font-condensed">
        {agent.phone ? (
          <>
            <a href={telHref(agent.phone)} className="hover:text-amber-hi">
              ☎ {formatPhone(agent.phone)}
            </a>
            {agent.preferred_contact && <span className="text-faint"> · prefers {agent.preferred_contact}</span>}
            {agent.best_time_to_call && <span className="text-faint"> · {agent.best_time_to_call}</span>}
          </>
        ) : (
          <span className="text-faint">no phone on file</span>
        )}
      </p>
      <div className="mt-2.5 pt-2 border-t border-hairline">
        <Label>Latest notes</Label>
        {desk.failed ? (
          <p className="text-[12.5px] text-amber-hi mt-0.5">The notes didn't come through — open the desk to read them.</p>
        ) : latest == null ? (
          <p className="text-[12.5px] text-faint mt-0.5">notes…</p>
        ) : latest.length === 0 ? (
          <p className="text-[12.5px] text-faint mt-0.5">No notes on file.</p>
        ) : (
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {latest.map((n) => (
              <li key={n.id} className="text-[12.5px] text-dim leading-snug">
                <span className="text-faint">{noteDay(n.created_at)} —</span> {n.note}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
