import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { StatusPill } from "@/components/ui/StatusPill";
import CoverageEditor from "@/components/relationships/CoverageEditor";
import { patchAgent } from "@/services/patchAgentService";
import { createAgentContact } from "@/services/agentContactsService";
import { createAgentNote } from "@/services/createAgentNoteService";
import { type AgentCoverage } from "@/services/agentCoverageService";
import { lastTouchOf, type ContactLike } from "@/lib/metrics/relationships";
import { loadRevenue } from "@/lib/metrics/loads";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";

// The Tier-3 qualification sweep (approved mockup, 2026-09-10).
//
// One screen, one job. Dispatch is on the phone and cannot navigate, so the
// layout is built around the single question that decides everything
// downstream — direct, spot, or unclear — and coverage capture that keeps pace
// with speech. Everything else on the call is a bonus.

const DAY = 86_400_000;

const FREIGHT = ["standard flatbed", "oversize", "hazmat", "heavy haul"] as const;

type Outcome = "reached" | "voicemail" | "no_answer" | "bad_number";

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: "reached", label: "Reached" },
  { value: "voicemail", label: "Voicemail" },
  { value: "no_answer", label: "No answer" },
  { value: "bad_number", label: "Bad number" },
];

const TAG =
  "px-3 py-[6px] rounded-[8px] text-[13px] border transition-colors cursor-pointer";
const TAG_OFF = "border-hairline bg-panel text-dim hover:text-ink";
const TAG_ON = "border-amber text-amber-hi bg-amber/10";
const LBL =
  "font-condensed font-semibold text-[12px] tracking-[.15em] uppercase text-dim mb-[11px]";

interface Props {
  agents: Agent[];
  loads: Load[];
  contacts: ContactLike[];
  coverage: AgentCoverage[];
  onChanged: () => void;
}

export const QualifySweep = ({
  agents,
  loads,
  contacts,
  coverage,
  onChanged,
}: Props) => {
  const [cursor, setCursor] = useState(0);
  const [cls, setCls] = useState<"direct" | "unclear" | "spot" | null>(null);
  const [freight, setFreight] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<Outcome>("reached");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The queue: never-asked agents still in the working book. A pinned class
  // means the question has been answered, so they drop out — including anyone
  // marked 'unclear', who returns via the normal rotation rather than here.
  const queue = useMemo(() => {
    const revenueOf = new Map<string, number>();
    for (const l of loads) {
      if (!l.agent_id || l.load_status === "cancelled") continue;
      revenueOf.set(l.agent_id, (revenueOf.get(l.agent_id) ?? 0) + loadRevenue(l));
    }
    return agents
      .filter(
        (a) =>
          a.relationship_tier === 3 &&
          a.work_status !== "parked" &&
          (a.agent_class ?? null) === null,
      )
      .sort((x, y) => (revenueOf.get(y.agent_id) ?? 0) - (revenueOf.get(x.agent_id) ?? 0));
  }, [agents, loads]);

  const agent = queue[cursor];

  // Everything the header shows about this agent, from data already loaded.
  const stats = useMemo(() => {
    if (!agent) return null;
    const mine = loads.filter(
      (l) => l.agent_id === agent.agent_id && l.load_status !== "cancelled",
    );
    const revenue = mine.reduce((sum, l) => sum + loadRevenue(l), 0);
    const miles = mine.reduce(
      (sum, l) => sum + (l.loaded_miles ?? 0) + (l.deadhead_miles ?? 0),
      0,
    );
    const last = lastTouchOf(agent.agent_id, contacts);
    return {
      loads: mine.length,
      revenue,
      // null, not 0 — "no miles recorded" is not "$0.00 a mile".
      rpm: miles > 0 ? revenue / miles : null,
      daysSince:
        last == null ? null : Math.max(0, Math.floor((Date.now() - Date.parse(last)) / DAY)),
    };
  }, [agent, loads, contacts]);

  const mine = useMemo(
    () => (agent ? coverage.filter((c) => c.agent_id === agent.agent_id) : []),
    [coverage, agent],
  );

  if (queue.length === 0) {
    return (
      <Panel className="p-8 text-center">
        <p className="font-display text-[26px] tracking-[.02em] text-ink">Sweep complete</p>
        <p className="text-dim text-[14px] mt-2">
          Every Tier 3 agent has been asked. New agents join the queue as they are added.
        </p>
      </Panel>
    );
  }

  if (!agent || !stats) return null;

  const logAndNext = async () => {
    setSaving(true);
    setErr(null);
    try {
      // ORDER MATTERS. Pinning the class is what drops this agent out of the
      // queue, so it goes LAST. Do it first and a later failure leaves the
      // agent classed, gone from the sweep, with no record of the call — and
      // the operator staring at an error, believing nothing saved.
      //
      // With the class last, every failure mode is recoverable: the agent stays
      // in the queue and the call can simply be logged again.
      await createAgentContact({
        agent_id: agent.agent_id,
        direction: "outbound",
        method: "call",
        type: "qualification",
        note: `Qualification call — ${outcome.replace("_", " ")}${
          cls ? ` · ${cls}` : ""
        }`,
      });

      // The narrative of the call, kept where it will actually be read again:
      // the agent's own notes on their detail page.
      if (note.trim()) {
        await createAgentNote(agent.agent_id, {
          note: `Qualification call — ${note.trim()}`,
          created_by: "DISP", // the sweep is always dispatch; ≤5 chars
        });
      }

      // Only pin when the call produced an answer. A voicemail or no-answer
      // leaves the class null so the agent comes round again.
      if (cls) {
        await patchAgent(agent.agent_id, {
          agent_class: cls,
          ...(freight.length > 0 ? { freight_types: freight } : {}),
        });
      }

      setCls(null);
      setFreight([]);
      setOutcome("reached");
      setNote("");
      setCursor((c) => c + 1);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not log the call");
    } finally {
      setSaving(false);
    }
  };

  const money = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <Panel className="overflow-hidden">
      {/* ---- who am I calling ---- */}
      <div className="p-[20px_22px] border-b border-hairline">
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div>
            <StatusPill tone="amber">
              Tier 3 sweep · {cursor + 1} of {queue.length}
            </StatusPill>
            <div className="font-display text-[34px] tracking-[.02em] leading-none mt-[9px] mb-[2px] text-ink">
              {agent.first_name} {agent.last_name}
            </div>
            <div className="text-dim text-[13.5px]">
              {agent.broker_name}
              {agent.agent_city ? ` · ${agent.agent_city}, ${agent.agent_state ?? ""}` : ""}
            </div>
          </div>
          {agent.phone && (
            <a
              href={`tel:${agent.phone}`}
              className="bg-amber text-[#241701] rounded-[8px] px-[17px] py-[10px] font-bold text-[14px] hover:bg-amber-hi"
            >
              Call {agent.phone}
            </a>
          )}
        </div>

        <div className="flex gap-7 mt-4 flex-wrap">
          <Stat k="Loads" v={String(stats.loads)} />
          <Stat k="Revenue" v={money(stats.revenue)} />
          <Stat k="Rate" v={stats.rpm == null ? "—" : `$${stats.rpm.toFixed(2)}`} sub="/mi" />
          <Stat
            k="Last contact"
            v={stats.daysSince == null ? "never" : `${stats.daysSince}d`}
            danger={stats.daysSince == null || stats.daysSince > 90}
          />
          <div>
            <span className="font-condensed font-semibold text-[11.5px] tracking-[.14em] uppercase text-dim block">
              Class now
            </span>
            <span className="inline-block mt-[3px]">
              <StatusPill tone="neutral">
                {(agent.agent_class ?? "spot") + " · " + (agent.agent_class ? "pinned" : "auto")}
              </StatusPill>
            </span>
          </div>
        </div>
      </div>

      {/* ---- the work ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2">
        <div className="p-[20px_22px]">
          <Panel variant="hero" className="p-[16px_17px_17px] mb-6">
            <p className={`${LBL} text-amber-hi`}>The one question</p>
            <div className="flex flex-col gap-[7px]">
              <Choice
                on={cls === "direct"}
                onPick={() => setCls("direct")}
                title="Direct"
                desc="Has their own customers"
              />
              <Choice
                on={cls === "spot"}
                onPick={() => setCls("spot")}
                title="Spot"
                desc="Works the Landstar board — the only answer that can park them"
              />
              <Choice
                on={cls === "unclear"}
                onPick={() => setCls("unclear")}
                title="Unclear"
                desc="Asked, couldn't tell. Stays in the book, comes round again"
              />
            </div>
          </Panel>

          <p className={LBL}>On the call</p>
          <ul className="flex flex-col gap-[9px]">
            {[
              "Who do you cover, and out of which cities?",
              "Flatbed, oversize, permit and escort work?",
              "Anything regular the truck could be part of?",
              "Best number, and best time of day?",
            ].map((q) => (
              <li key={q} className="text-dim text-[13.5px] pl-4 relative leading-[1.45]">
                <span className="absolute left-0 text-amber font-bold">›</span>
                {q}
              </li>
            ))}
          </ul>
        </div>

        <div className="p-[20px_22px] border-t md:border-t-0 md:border-l border-hairline">
          <p className={LBL}>Coverage they named</p>
          <CoverageEditor agentId={agent.agent_id} rows={mine} onChanged={onChanged} />

          <p className={`${LBL} mt-6`}>Freight this agent moves</p>
          <div className="flex flex-wrap gap-2">
            {FREIGHT.map((f) => (
              <button
                key={f}
                onClick={() =>
                  setFreight((cur) =>
                    cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f],
                  )
                }
                className={`${TAG} ${freight.includes(f) ? TAG_ON : TAG_OFF}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---- what actually happened on the call ---- */}
      <div className="p-[16px_22px] border-t border-hairline">
        <p className={LBL}>
          Call notes{" "}
          <span className="normal-case tracking-normal font-body text-faint">
            — saved to this agent's notes
          </span>
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="What they said, what they cover, anything worth remembering next time…"
          className="w-full bg-canvas border border-hairline rounded-[8px] px-3 py-[10px] text-ink text-[14px] placeholder:text-faint resize-y"
        />
      </div>

      {/* ---- close the call ---- */}
      <div className="flex justify-between items-center gap-4 flex-wrap p-[14px_22px] border-t border-hairline bg-steel">
        <div className="flex flex-wrap gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              onClick={() => setOutcome(o.value)}
              className={`${TAG} ${outcome === o.value ? TAG_ON : TAG_OFF}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {err && <span className="text-status-negative-text text-[13px]">{err}</span>}
          <button
            onClick={logAndNext}
            disabled={saving}
            className="bg-amber text-[#241701] rounded-[8px] px-5 py-[11px] font-bold text-[14.5px] hover:bg-amber-hi disabled:opacity-40"
          >
            {saving ? "Saving…" : "Log & next agent →"}
          </button>
        </div>
      </div>
    </Panel>
  );
};

const Stat = ({
  k,
  v,
  sub,
  danger,
}: {
  k: string;
  v: string;
  sub?: string;
  danger?: boolean;
}) => (
  <div>
    <span className="font-condensed font-semibold text-[11.5px] tracking-[.14em] uppercase text-dim block">
      {k}
    </span>
    <span
      className={`text-[19px] font-semibold tabular-nums leading-[1.3] ${
        danger ? "text-status-negative-text" : "text-ink"
      }`}
    >
      {v}
      {sub && <small className="text-[12px] text-dim font-normal">{sub}</small>}
    </span>
  </div>
);

const Choice = ({
  on,
  onPick,
  title,
  desc,
}: {
  on: boolean;
  onPick: () => void;
  title: string;
  desc: string;
}) => (
  <button
    onClick={onPick}
    aria-pressed={on}
    className={`flex items-start gap-[11px] px-[13px] py-[11px] rounded-[9px] border text-left ${
      on ? "border-amber bg-amber/10" : "border-white/10 bg-canvas/40 hover:border-white/20"
    }`}
  >
    <i
      className={`w-[15px] h-[15px] rounded-full border-2 shrink-0 mt-[3px] relative ${
        on ? "border-amber" : "border-dim"
      }`}
    >
      {on && <i className="absolute inset-[2.5px] rounded-full bg-amber" />}
    </i>
    <span>
      <span className="block font-bold text-[14.5px] text-ink">{title}</span>
      <span className="block text-dim text-[12.5px] leading-[1.4]">{desc}</span>
    </span>
  </button>
);

export default QualifySweep;
