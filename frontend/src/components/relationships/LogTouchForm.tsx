import { useMemo, useState } from "react";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { StatusPill } from "@/components/ui/StatusPill";
import type { Agent } from "@/types/agent";
import type {
  AgentContact,
  ContactDirection,
  ContactMethod,
  ContactNextStep,
  ContactOutcome,
  CreateAgentContactInput,
  PatchAgentContactInput,
} from "@/services/agentContactsService";
import {
  contactKind,
  contactTypeLabel,
  defaultTouchType,
  isProactive,
  pickerTypes,
  typeTabs,
  type ContactType,
} from "@/lib/relationships/contactTypes";
import { alreadyCarries, capStatus, foldPatch } from "@/lib/relationships/contactCap";
import { weekdayShort } from "@/lib/relationships/dayKeys";
import { CLASS_HELP, CLASS_TABS, NEXT_TABS, OUTCOME_TABS, capDoors, dateChips, type ClassPick } from "@/lib/relationships/touchOptions";
import { CapGate } from "./CapGate";
import { FieldLabel, PrimaryButton, ErrorLine } from "./primitives";

// LOG A TOUCH, v2 — one component, used by the agent sheet now and by Today /
// Call list later. Two taps for the common case: the direction · method ·
// type collapse into a summary line, and the cap is built in — a second
// proactive touch in the same week is refused with a plain sentence and
// offered as a FOLD into the message that already went out. A reason that
// message already carries has nothing to fold — the form says so and writes
// nothing.
//
// The class pin ("the one question") is handed back separately — with a log
// AND with a fold — so the parent writes it LAST, after the contact: it is an
// AGENT patch, independent of the touch (the call screen's write order).

export interface TouchPrefill {
  direction?: ContactDirection;
  method?: ContactMethod;
  type?: ContactType;
  // Today's rows carry more: a close-out is logged against its load, and a
  // nurture flag's note starts with its marker so the flag stays down.
  load_id?: string | null;
  note?: string;
  // A CALL BACK row: the call was promised, so the cap never refuses it — the
  // form skips the gate and logs with cap_override; the prefilled note says
  // "callback promised {day}" (editable).
  promised?: true;
}

export interface ClassPin {
  agent_class: "direct" | "spot" | "unclear";
  park: boolean;
  parkReason: string;
}

export interface LogTouchPayload {
  contact: CreateAgentContactInput;
  classPin: ClassPin | null;
}

// A fold: the first proactive message of the week grows by this reason and
// carries the form's follow-up (note appended, a real next step, a captured
// footprint). Nothing new is created.
export interface FoldPayload {
  into: AgentContact;
  type: ContactType;
  patch: PatchAgentContactInput;
  classPin: ClassPin | null;
}

interface Props {
  agent: Agent;
  contacts: AgentContact[]; // every contact — the cap reads this agent's week
  deliveredCount: number;
  now: Date;
  isAdmin: boolean;
  isProspect: boolean; // no owner-set tier → footprint toggle shows
  prefill?: TouchPrefill;
  busy: boolean;
  error: string | null;
  onLog: (payload: LogTouchPayload) => void;
  onFold: (payload: FoldPayload) => void;
}

const DIRECTION_TABS: { value: ContactDirection; label: string }[] = [
  { value: "outbound", label: "I reached out" },
  { value: "inbound", label: "They reached out" },
];
const METHOD_TABS: { value: ContactMethod; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
];
// The outcome / next-step / class tabs and the callback date chips live in
// lib/relationships/touchOptions — shared with the Call list's call screen.
const METHOD_WORD: Record<ContactMethod, string> = { call: "call", text: "text", email: "email" };
const KIND_WORD = { proactive: "proactive", operational: "operational", inbound: "inbound", owner: "owner personal" } as const;

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mt-3">
    <FieldLabel>{label}</FieldLabel>
    {children}
  </div>
);

export const LogTouchForm = ({
  agent,
  contacts,
  deliveredCount,
  now,
  isAdmin,
  isProspect,
  prefill,
  busy,
  error,
  onLog,
  onFold,
}: Props) => {
  const fallbackType = defaultTouchType(agent, deliveredCount);
  const [expanded, setExpanded] = useState(false);
  const [direction, setDirection] = useState<ContactDirection>(prefill?.direction ?? "outbound");
  const [method, setMethod] = useState<ContactMethod>(prefill?.method ?? "call");
  const [type, setType] = useState<ContactType>(prefill?.type ?? fallbackType);
  const [outcome, setOutcome] = useState<ContactOutcome>("reached");
  const [cls, setCls] = useState<ClassPick | null>(null);
  const [parkNow, setParkNow] = useState(false);
  const [parkReason, setParkReason] = useState("");
  const [nextStep, setNextStep] = useState<ContactNextStep>("none");
  const [nextStepAt, setNextStepAt] = useState<string | null>(null);
  const [footprint, setFootprint] = useState(false);
  const [note, setNote] = useState(prefill?.note ?? "");

  const options = useMemo(() => pickerTypes(direction, { admin: isAdmin }), [direction, isAdmin]);
  const kind = contactKind(type, direction);
  const proactive = isProactive({ type, direction });
  const cap = useMemo(() => capStatus(agent.agent_id, contacts, now), [agent.agent_id, contacts, now]);
  // A promised call-back is kept, not refused: the cap gate is skipped and the
  // contact carries cap_override so the record says why a second touch went out.
  const promised = prefill?.promised === true;
  const capped = !promised && proactive && cap.blocked && cap.first != null;
  // The chosen reason is already in this week's message — as its own type or
  // an earlier fold — so there is nothing to PATCH.
  const carried = capped && cap.first != null && alreadyCarries(cap.first, type);
  // THE RULING (REL-01 v2.0 §4, PR 3): a call is never folded — here on the
  // agent sheet as much as on the call screen — because a fold would erase
  // the outcome the call carries. On a call the gate loses its Fold door and
  // offers only "Log anyway", which writes cap_override with the note as the
  // reason; a message keeps both doors. lib/relationships/touchOptions.
  const doors = capDoors(method);

  const showOutcome = direction === "outbound" && method === "call";
  const spoke = method === "call" && (direction === "inbound" || outcome === "reached");
  const showQuestion =
    spoke && (agent.agent_class == null || agent.agent_class === "unclear") && agent.relationship_tier == null;
  const chips = useMemo(() => dateChips(now), [now]);

  // A direction change re-checks the type: inbound offers Load offer / Other,
  // outbound goes back to the agent's default.
  const pickDirection = (d: ContactDirection) => {
    setDirection(d);
    const allowed = pickerTypes(d, { admin: isAdmin });
    if (!allowed.some((o) => o.value === type)) setType(d === "inbound" ? "inbound_inquiry" : fallbackType);
  };
  const pickOutcome = (o: ContactOutcome) => {
    setOutcome(o);
    if (o !== "reached") setCls(null); // no answer → no basis for a class
  };

  // The one question's answer — an AGENT patch the parent writes last, whether
  // the touch is logged or folded.
  const classPin: ClassPin | null =
    showQuestion && cls ? { agent_class: cls, park: cls === "spot" && parkNow, parkReason: parkReason.trim() } : null;
  const nextStepAtOut = nextStep === "call_back" ? nextStepAt : null;
  const footprintOut = isProspect ? footprint : false;

  const build = (capOverride: boolean): LogTouchPayload => ({
    contact: {
      agent_id: agent.agent_id,
      direction,
      method,
      type,
      outcome: showOutcome ? outcome : null,
      next_step: nextStep,
      next_step_at: nextStepAtOut,
      footprint_captured: footprintOut,
      note: note.trim() || null,
      cap_override: capOverride || promised,
      ...(prefill?.load_id ? { load_id: prefill.load_id } : {}),
    },
    classPin,
  });

  const buildFold = (into: AgentContact): FoldPayload => ({
    into,
    type,
    patch: foldPatch(into, type, {
      note: note.trim() || null,
      next_step: nextStep,
      next_step_at: nextStepAtOut,
      footprint_captured: footprintOut,
    }),
    classPin,
  });

  const summary = `${direction === "outbound" ? "I reached out" : "They reached out"} · ${METHOD_WORD[method]} · ${contactTypeLabel(type)}${
    showOutcome && outcome !== "reached" ? ` · ${OUTCOME_TABS.find((o) => o.value === outcome)?.label.toLowerCase()}` : ""
  }`;

  return (
    <div>
      {expanded ? (
        <>
          <Field label="Direction">
            <SegmentedTabs tabs={DIRECTION_TABS} value={direction} onChange={pickDirection} size="sm" ariaLabel="Direction" />
          </Field>
          <Field label="Method">
            <SegmentedTabs tabs={METHOD_TABS} value={method} onChange={setMethod} size="sm" ariaLabel="Method" />
          </Field>
          <Field label="Type">
            <SegmentedTabs tabs={typeTabs(options)} value={type} onChange={setType} size="sm" ariaLabel="Type" />
            <p className="font-condensed text-[11.5px] text-faint mt-1">
              {kind === "proactive"
                ? "proactive — counts against the one-a-week cap"
                : kind === "operational"
                  ? "operational — never capped"
                  : kind === "inbound"
                    ? "inbound — resets their cooling clock"
                    : "the owner's thread — uncapped"}
            </p>
          </Field>
          {showOutcome && (
            <Field label="Outcome">
              <SegmentedTabs tabs={OUTCOME_TABS} value={outcome} onChange={pickOutcome} size="sm" ariaLabel="Outcome" />
            </Field>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2 mt-2 font-condensed text-[13.5px] text-dim flex-wrap">
          <span>
            <b className="text-ink font-semibold">{summary.split(" · ")[0]}</b>
            {summary.slice(summary.indexOf(" · "))}
          </span>
          <StatusPill tone="neutral" className="h-[18px]">
            {KIND_WORD[kind]}
          </StatusPill>
          <button type="button" onClick={() => setExpanded(true)} className="ml-auto text-[12px] text-amber-hi hover:text-hot">
            change
          </button>
        </div>
      )}

      {showQuestion && (
        <Field label="The one question — do they have their own customers?">
          <SegmentedTabs tabs={CLASS_TABS} value={cls ?? ("" as ClassPick)} onChange={setCls} size="sm" ariaLabel="Agent class" />
          <p className="font-condensed text-[11.5px] text-faint mt-1">{CLASS_HELP}</p>
          {cls === "spot" && (
            <div className="mt-2">
              <label className="flex items-start gap-2 cursor-pointer text-[13px] text-dim leading-snug">
                <input type="checkbox" checked={parkNow} onChange={(e) => setParkNow(e.target.checked)} className="mt-[3px] accent-[#e8940a]" />
                <span>
                  <b className="text-ink">Park them now</b> — leaves every list, keeps every record.
                </span>
              </label>
              {parkNow && (
                <input
                  value={parkReason}
                  onChange={(e) => setParkReason(e.target.value)}
                  placeholder="Reason — optional for spot"
                  className="ds-input mt-2"
                />
              )}
            </div>
          )}
        </Field>
      )}

      <Field label="Next step">
        <SegmentedTabs tabs={NEXT_TABS} value={nextStep} onChange={setNextStep} size="sm" ariaLabel="Next step" />
        {nextStep === "call_back" && (
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => setNextStepAt(c.key)}
                className={`h-8 px-3 rounded-[8px] border font-condensed text-[12.5px] ${
                  nextStepAt === c.key ? "border-amber text-amber-hi bg-amber/10" : "border-hairline text-dim hover:text-ink"
                }`}
              >
                {c.label}
              </button>
            ))}
            <input
              type="date"
              aria-label="Pick a date"
              value={nextStepAt ?? ""}
              onChange={(e) => setNextStepAt(e.target.value || null)}
              className="ds-input h-8 w-auto text-[13px]"
            />
          </div>
        )}
      </Field>

      {isProspect && (
        <label className="flex items-center gap-2 mt-3 cursor-pointer font-condensed text-[13px] text-dim">
          <input type="checkbox" checked={footprint} onChange={(e) => setFootprint(e.target.checked)} className="accent-[#e8940a]" />
          <span>
            <b className="text-ink">Footprint captured</b> — markets, freight, best time on file
          </span>
        </label>
      )}

      <Field label="Note">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="what happened · promised · owed · load #"
          className="ds-input"
        />
      </Field>

      <ErrorLine>{error}</ErrorLine>

      {promised && proactive && cap.blocked && cap.first && (
        <p className="font-condensed text-[12.5px] text-faint mt-3 leading-snug">
          {agent.first_name} already had a proactive touch this week ({contactTypeLabel(cap.first.type)}, {weekdayShort(cap.first.contacted_at)}) — a promised call-back is
          kept anyway; this one logs with the cap overridden.
        </p>
      )}

      {capped && cap.first ? (
        <CapGate
          firstName={agent.first_name}
          first={cap.first}
          type={type}
          carried={carried}
          busy={busy}
          noteEmpty={note.trim().length === 0}
          onFold={doors.fold ? () => cap.first && onFold(buildFold(cap.first)) : undefined}
          onLogAnyway={() => onLog(build(true))}
        />
      ) : (
        <PrimaryButton size="lg" className="w-full mt-4" disabled={busy} onClick={() => onLog(build(false))}>
          {busy ? "Logging…" : "Log it"}
        </PrimaryButton>
      )}
    </div>
  );
};
