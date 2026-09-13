import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, ChevronLeft, ChevronUp, CornerDownRight, Mail, MessageSquare, Phone } from "lucide-react";
import type { Agent } from "@/types/agent";
import type { Broker } from "@/types/broker";
import type { Load } from "@/types/load";
import type { AgentPatchPayload } from "@/types/agentPatchPayload";
import { StatusPill } from "@/components/ui/StatusPill";
import { Well } from "@/components/ui/ForgedPlate";
import { MeterCells } from "@/components/awards/HardwareBoard";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import {
  createAgentContact,
  deleteAgentContact,
  type AgentContact,
  type ContactNextStep,
  type ContactOutcome,
  type CreateAgentContactInput,
} from "@/services/agentContactsService";
import type { AgentCoverage } from "@/services/agentCoverageService";
import { patchAgent } from "@/services/patchAgentService";
import { createAgent } from "@/services/createAgentService";
import { createBroker } from "@/services/createBrokerService";
import { createAgentNote } from "@/services/createAgentNoteService";
import { formatPhone, smsHref, telHref } from "@/lib/phone";
import { money } from "@/lib/format";
import { LOAD_TYPES } from "@/lib/metrics/foreman";
import { loadGross } from "@/lib/metrics/rateTargets";
import { originMarketsByAgent } from "@/lib/metrics/agentTouches";
import type { AgentScorecard } from "@/lib/metrics/agentScorecard";
import { bucketLabel, bucketOf } from "@/lib/relationships/buckets";
import { alreadyCarries, capStatus } from "@/lib/relationships/contactCap";
import { contactTypeLabel, type ContactType } from "@/lib/relationships/contactTypes";
import { daysBetweenKeys, keyOf, utcDayKey, weekdayShort } from "@/lib/relationships/dayKeys";
import { nameOf } from "@/lib/relationships/nameOf";
import { CLASS_HELP, CLASS_TABS, NEXT_TABS, OUTCOME_TABS, dateChips, outcomeLabel, type ClassPick } from "@/lib/relationships/touchOptions";
import {
  FOOTPRINT_MARKERS,
  FOOTPRINT_QUESTIONS,
  classLabel,
  footprintScore,
  noteMarkers,
  type FootprintParts,
  type MarketGrade,
} from "@/lib/relationships/callList";
import {
  monthWord,
  prospectingOpener,
  prospectingVoicemail,
  reactivationOpener,
  reactivationVoicemail,
  type ScriptContext,
} from "@/lib/relationships/callScripts";
import CoverageEditor from "./CoverageEditor";
import { CapGate } from "./CapGate";
import { CodeChip, ErrorLine, FieldLabel, GhostButton, GhostLink, PrimaryButton, PrimaryLink, SectionHead } from "./primitives";

// THE CALL SCREEN — /relationships/calls/:agentId. One screen, one job:
// Brandie is on the phone and cannot navigate, so everything the Gameplan
// asks of a call sits on one scroll — the opener, the footprint six with the
// capture inline, the outcome, the one question, the next step, the note,
// and "someone else answered" — and one button files it all in the order
// that keeps a failure recoverable. Phone: a full-screen sheet pushed over
// the list (back chevron, n of N); md+: the right pane beside the list. Same
// component, CSS decides.
//
// WRITE ORDER (fixed, and the reason it stays fixed):
//   1. the divert target — found on ANY code, or created
//   2. the CONTACT (type reactivation | cold per the Working list, outbound,
//      call, outcome, next step, footprint_captured, the note with its folded
//      [lane] · [regular] · [season] prefixes; cap_override when the week's
//      cap was already hit — THE CAP below)
//   3. the breadcrumb note on the DIALED record when the call diverted
//   4. patchAgent LAST — agent_class only when reached, freight_types,
//      best_time_to_call, the confirmed phone, a park
// Pinning the class is what drops an agent out of the question; done first,
// a later failure would leave them classed with no record of the call. Done
// last, every failure leaves the agent listed and the call re-loggable — and
// a retry skips whatever already saved.
//
// THE CAP (REL-01 §4; ruled 2026-09-12): the fold exists for MESSAGES — a
// second reason rides on the message that already went out. A call that
// actually happened carries an OUTCOME: reached is a two-way contact (the
// quiet clock, the dormancy verdict — lastMeaningfulContact needs method
// call + outcome reached), voicemail / no answer / bad number are the
// unreached count and the BAD # chip. A fold carries none of that — a folded
// reached call left the agent on the reactivation list as "never called" —
// so A CALL IS NEVER FOLDED. When the cap is hit the gate shows the reason
// and "Log anyway" writes the contact as it happened with cap_override and a
// note saying why; the header wears TOUCHED {DAY} before the dial so Brandie
// sees the cap before she taps Call.
//
// WHOSE RECORD: dialed ↔ a picked agent ↔ someone being created. The class,
// the cap and THE FOOTPRINT (markets, freight, best time, the note markers,
// the "n of 6", footprint_captured) all follow the resolved target, never
// the dialed record — the chips and the best time were prefilled from the
// dialed record, so on another human they count only once Brandie touched
// them, the same rule agentPatch writes by.

export type Working = "reactivation" | "prospects";

export interface CallScreenProps {
  agent: Agent; // the record dialed
  agents: Agent[]; // every agent — the divert search is person-first, any code
  brokers: Broker[];
  loads: Load[];
  contacts: AgentContact[];
  coverage: AgentCoverage[];
  scorecard: AgentScorecard | undefined;
  now: Date;
  working: Working;
  grade: MarketGrade;
  why: string | null; // the list's rank reason; null when they are not on today's list
  // "n of N" inside this rotation; null off it. A recycled row (the RECYCLE
  // fold — listed, never next) has no position and reads "next rotation".
  position: { index: number; total: number } | null;
  recycled: boolean;
  firstCallOfDay: boolean;
  onBack: () => void;
  onSkip: () => void;
  // After the writes and the reload. `diverted` — the dialed record is NOT
  // handled (Brandie deals with it herself); the screen stays and resets.
  onLogged: (dialedAgentId: string, diverted: boolean) => void;
  reload: () => Promise<void>;
  notify: (message: string, action?: { label: string; run: () => void | Promise<void> }) => void;
}

// "anyway" = the cap was hit and Brandie logged the call regardless — the
// contact carries cap_override. There is no fold mode for a call (THE CAP).
type WriteMode = "log" | "anyway";

const TAG = "px-3 py-[6px] rounded-[8px] text-[13px] border transition-colors cursor-pointer";
const TAG_OFF = "border-hairline bg-panel text-dim hover:text-ink";
const TAG_ON = "border-amber text-amber-hi bg-amber/10";
const CHIP_BTN = "h-8 px-3 rounded-[8px] border font-condensed text-[12.5px]";
const CHIP_ON = "border-amber text-amber-hi bg-amber/10";
const CHIP_OFF = "border-hairline text-dim hover:text-ink";

const prefersWord = (v: string | null): string | null =>
  v === "phone" ? "call" : v === "text" ? "text" : v === "email" ? "email" : null;

// The signed-in user's name for the script, and their initials for the
// breadcrumb note (≤5 chars) — never a hardcoded name.
const signedInName = (): string | null => {
  try {
    return localStorage.getItem("display_name")?.trim() || null;
  } catch {
    return null;
  }
};
const initialsOf = (name: string | null): string => {
  const letters = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("");
  return letters.slice(0, 5) || "DISP";
};

// Answers to questions 3–5 ride in the note under their prefixes, so the next
// call — and the footprint score — can read them back.
const foldNote = (note: string, lane: string, regular: string, season: string, tail: string | null): string | null => {
  const parts = [
    note.trim() || null,
    lane.trim() ? `${FOOTPRINT_MARKERS.lane} ${lane.trim()}` : null,
    regular.trim() ? `${FOOTPRINT_MARKERS.regular} ${regular.trim()}` : null,
    season.trim() ? `${FOOTPRINT_MARKERS.season} ${season.trim()}` : null,
    tail,
  ].filter((p): p is string => p != null);
  return parts.length ? parts.join(" · ") : null;
};

const sameList = (a: string[] | undefined, b: string[]): boolean => {
  const x = [...(a ?? [])].sort();
  const y = [...b].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

// A person's name as typed, for matching: trimmed, single-spaced, lowercased.
const normName = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

const Question = ({
  n,
  text,
  done,
  children,
}: {
  n: number;
  text: string;
  done: boolean;
  children: ReactNode;
}) => (
  <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2 py-3 border-t border-hairline-lo">
    <span className="font-display text-[20px] text-amber-hi leading-none pt-0.5">{n}</span>
    <div className="min-w-0">
      <p className="font-condensed text-[14px] text-ink flex items-center gap-2 mb-2">
        {text}
        {done && <Check size={14} className="text-status-positive-text shrink-0" aria-label="answered" />}
      </p>
      {children}
    </div>
  </li>
);

const Stat = ({ label, value, sub }: { label: string; value: string; sub: string | null }) => (
  <div className="min-w-0">
    <p className="font-condensed text-[11px] tracking-[.12em] uppercase text-faint">{label}</p>
    <p className="font-display text-[24px] text-ink leading-none mt-1 truncate tabular-nums">{value}</p>
    {sub && <p className="text-[12px] text-dim mt-1 truncate">{sub}</p>}
  </div>
);

export const CallScreen = ({
  agent,
  agents,
  brokers,
  loads,
  contacts,
  coverage,
  scorecard,
  now,
  working,
  grade,
  why,
  position,
  recycled,
  firstCallOfDay,
  onBack,
  onSkip,
  onLogged,
  reload,
  notify,
}: CallScreenProps) => {
  // ---- the call's answers ----
  const [outcome, setOutcome] = useState<ContactOutcome>("reached");
  const [cls, setCls] = useState<ClassPick | null>(null);
  const [changeClass, setChangeClass] = useState(false); // a pinned class opened for a re-answer
  const [parkNow, setParkNow] = useState(false);
  const [parkReason, setParkReason] = useState("");
  const [nextStep, setNextStep] = useState<ContactNextStep>("none");
  const [nextStepAt, setNextStepAt] = useState<string | null>(null);
  const [note, setNote] = useState("");
  // the footprint six
  const [freight, setFreight] = useState<string[]>(agent.freight_types ?? []);
  const [lane, setLane] = useState("");
  const [regular, setRegular] = useState("");
  const [season, setSeason] = useState("");
  const [phone, setPhone] = useState(agent.phone ?? "");
  const [bestTime, setBestTime] = useState(agent.best_time_to_call ?? "");
  // The Footprint captured toggle, flipped by hand — remembered against the
  // target it was flipped for, so a change of target (dialed ↔ pick ↔
  // creating) falls back to the auto-suggest without an effect.
  const [capturedManual, setCapturedManual] = useState<{ target: string; on: boolean } | null>(null);
  // divert
  const [divertOpen, setDivertOpen] = useState(false);
  const [divertName, setDivertName] = useState("");
  const [divertPick, setDivertPick] = useState<Agent | null>(null);
  const [divertCode, setDivertCode] = useState(agent.broker_name ?? "");
  // chrome
  const [scriptOpen, setScriptOpen] = useState(firstCallOfDay);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // What already saved in this form session, so a retry after a partial
  // failure never doubles a contact or a breadcrumb.
  const progress = useRef<{ target: Agent | null; brokerId: { code: string; id: string } | null; contactId: string | null; breadcrumb: boolean }>({
    target: null,
    brokerId: null, // a code this form already created — a retry reuses it (UNIQUE per user)
    contactId: null,
    breadcrumb: false,
  });

  const name = nameOf(agent);
  const type: ContactType = working === "reactivation" ? "reactivation" : "cold";
  const nowKey = utcDayKey(now);
  const ctx = useMemo(() => ({ loads, contacts, now }), [loads, contacts, now]);
  const bucket = useMemo(() => bucketOf(agent, ctx), [agent, ctx]);

  // ---- what the record says ----
  const delivered = useMemo(() => loads.filter((l) => l.agent_id === agent.agent_id && l.load_status === "delivered"), [loads, agent.agent_id]);
  const gross = useMemo(() => delivered.reduce((s, l) => s + loadGross(l), 0), [delivered]);
  const dialedMarkets = useMemo(() => originMarketsByAgent(delivered).get(agent.agent_id) ?? [], [delivered, agent.agent_id]);
  const topMarket = dialedMarkets[0]
    ? `${dialedMarkets[0].city}, ${dialedMarkets[0].state}`
    : agent.agent_city
      ? `${agent.agent_city}${agent.agent_state ? `, ${agent.agent_state}` : ""}`
      : null;
  const lastContact = useMemo(() => {
    let latest: AgentContact | null = null;
    let latestCall: AgentContact | null = null;
    for (const c of contacts) {
      if (c.agent_id !== agent.agent_id) continue;
      if (!latest || c.contacted_at > latest.contacted_at) latest = c;
      if (c.direction === "outbound" && c.method === "call" && (!latestCall || c.contacted_at > latestCall.contacted_at)) latestCall = c;
    }
    return { latest, latestCall };
  }, [contacts, agent.agent_id]);
  const badNumber = lastContact.latestCall?.outcome === "bad_number";
  const lastDays = lastContact.latest ? Math.max(0, daysBetweenKeys(keyOf(lastContact.latest.contacted_at), nowKey)) : null;
  const lastSub = lastContact.latest
    ? (outcomeLabel(lastContact.latest.outcome) ?? (lastContact.latest.direction === "inbound" ? "they reached out" : lastContact.latest.method)).toLowerCase()
    : "no touch on record";
  const classChip = classLabel(agent, scorecard);

  // ---- divert: person first, any code ----
  const others = useMemo(() => agents.filter((a) => a.agent_id !== agent.agent_id), [agents, agent.agent_id]);
  const divertQuery = normName(divertName);
  const divertMatches = useMemo(
    () => (divertQuery.length < 2 ? [] : others.filter((a) => normName(nameOf(a)).includes(divertQuery)).slice(0, 5)),
    [others, divertQuery],
  );
  // An exact full-name match (case-insensitive) IS that person: it is picked
  // for her as she types, and "create" is never offered while one exists —
  // "gary robinson" can never create a second Gary Robinson.
  const exactMatch = (typed: string): Agent | null => {
    const q = normName(typed);
    return q ? others.find((a) => normName(nameOf(a)) === q) ?? null : null;
  };
  const exact = exactMatch(divertName);
  const onDivertName = (typed: string) => {
    setDivertName(typed);
    const hit = exactMatch(typed);
    if (hit) setDivertPick(hit);
  };
  const divertWords = divertName.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  const creating = divertOpen && divertPick == null && exact == null && divertWords.length >= 2;
  const diverting = divertOpen && (divertPick != null || creating);
  // A single word typed and nothing picked — not enough to file a call under.
  const divertIncomplete = divertOpen && divertPick == null && divertName.trim().length > 0 && divertWords.length < 2;

  // ---- whose record this call files under (WHOSE RECORD, above) ----
  // null = someone being created: no record yet, so nothing on file counts.
  const target: Agent | null = divertPick ?? (creating ? null : agent);
  const targetIsDialed = target?.agent_id === agent.agent_id;
  const targetKey = target?.agent_id ?? "new";
  const classAgent: Pick<Agent, "agent_class" | "relationship_tier"> = target ?? { agent_class: null, relationship_tier: null };
  const capAgentId = target?.agent_id ?? null;
  const capFirstName = target?.first_name ?? divertWords[0];
  // Question 1 — the target's markets: stated on a call, and proven by THEIR
  // loads. Someone being created has none yet.
  const stated = useMemo(() => (target ? coverage.filter((c) => c.agent_id === target.agent_id) : []), [coverage, target]);
  const hauledFrom = useMemo(() => {
    if (!target) return [];
    if (target.agent_id === agent.agent_id) return dialedMarkets;
    return originMarketsByAgent(loads.filter((l) => l.agent_id === target.agent_id && l.load_status === "delivered")).get(target.agent_id) ?? [];
  }, [target, agent.agent_id, dialedMarkets, loads]);
  // Questions 3–5 — the markers THEIR contacts already carry.
  const markers = useMemo(
    () => (target ? noteMarkers(target.agent_id, contacts) : { lane: false, regular: false, season: false }),
    [target, contacts],
  );
  // Questions 2 and 6 — what the target's record holds after this call. The
  // chips and the best time were PREFILLED from the dialed record, so on
  // another human they count only if Brandie touched them (the rule
  // agentPatch writes by); otherwise whatever that person already has.
  const best = bestTime.trim() || null;
  const freightTouched = !sameList(agent.freight_types, freight);
  const bestTouched = best !== (agent.best_time_to_call ?? null);
  const targetFreight = targetIsDialed ? freight : freightTouched && freight.length > 0 ? freight : (divertPick?.freight_types ?? []);
  const targetBest = targetIsDialed ? best : bestTouched && best ? best : divertPick?.best_time_to_call?.trim() || null;

  // ---- the cap (REL-01 §4) — reactivation and prospecting are proactive ----
  // The dialed record's cap shows in the header BEFORE the dial; the gate on
  // the footer follows the target (who the call files under).
  const dialedCap = useMemo(() => capStatus(agent.agent_id, contacts, now), [agent.agent_id, contacts, now]);
  const cap = useMemo(
    () => (capAgentId == null ? null : capAgentId === agent.agent_id ? dialedCap : capStatus(capAgentId, contacts, now)),
    [capAgentId, agent.agent_id, dialedCap, contacts, now],
  );
  const capped = cap != null && cap.blocked && cap.first != null;
  const carried = capped && cap.first != null && alreadyCarries(cap.first, type);

  // ---- the one question ----
  const pinned = classAgent?.agent_class === "direct" || classAgent?.agent_class === "spot";
  const showQuestion =
    outcome === "reached" &&
    classAgent != null &&
    classAgent.relationship_tier == null &&
    (classAgent.agent_class == null || classAgent.agent_class === "unclear" || changeClass);
  const pickOutcome = (o: ContactOutcome) => {
    setOutcome(o);
    if (o !== "reached") setCls(null); // nobody spoken to → no basis for a class
  };

  // ---- the footprint six — the TARGET's ----
  const parts: FootprintParts = {
    markets: stated.length + hauledFrom.length > 0,
    freight: targetFreight.length > 0,
    bestTime: targetBest != null,
    lane: lane.trim().length > 0 || markers.lane,
    regular: regular.trim().length > 0 || markers.regular,
    season: season.trim().length > 0 || markers.season,
  };
  const score = footprintScore(parts);
  const autoCaptured = parts.markets && parts.freight && parts.bestTime;
  const manualCaptured = capturedManual?.target === targetKey ? capturedManual.on : null; // null = follow the auto-suggest
  const captured = manualCaptured ?? autoCaptured;
  const chips = useMemo(() => dateChips(now), [now]);

  // ---- the script ----
  const script = useMemo(() => {
    const last = [...delivered].sort((a, b) => (b.delivery_date ?? b.pickup_date).localeCompare(a.delivery_date ?? a.pickup_date))[0];
    const c: ScriptContext = {
      agentFirst: agent.first_name,
      caller: signedInName(),
      lastLoad: last
        ? {
            commodity: last.commodity,
            loadType: last.load_type,
            origin: `${last.origin_city}, ${last.origin_state}`,
            destination: `${last.destination_city}, ${last.destination_state}`,
            month: monthWord(last.pickup_date),
          }
        : null,
      market: topMarket,
      phone: null,
    };
    return working === "reactivation"
      ? { opener: reactivationOpener(c), voicemail: reactivationVoicemail(c), ref: "ADMIN-02 §7 ① · ⑤" }
      : { opener: prospectingOpener(c), voicemail: prospectingVoicemail(c), ref: "ADMIN-02 §7 ② · ⑥" };
  }, [delivered, agent.first_name, topMarket, working]);

  // ---- the write ----
  const resolveTarget = async (): Promise<Agent> => {
    if (!diverting) return agent;
    if (progress.current.target) return progress.current.target;
    if (divertPick) return divertPick;
    // Create who answered — on the code typed (matched, or created), or none.
    const code = divertCode.trim().toUpperCase();
    let brokerId: string | null = null;
    if (code) {
      const found = brokers.find((b) => b.broker_name.toUpperCase() === code);
      if (found) brokerId = found.broker_id;
      else if (progress.current.brokerId?.code === code) brokerId = progress.current.brokerId.id;
      else {
        const b = await createBroker({ broker_name: code, phone: null, email: null, rating: null, notes: null });
        progress.current.brokerId = { code, id: b.broker_id };
        brokerId = b.broker_id;
      }
    }
    const [first, ...rest] = divertWords;
    const created = await createAgent({
      broker_id: brokerId,
      first_name: first,
      last_name: rest.join(" "),
      phone: phone.trim() || agent.phone || null, // they answered this number
      email: null,
      preferred_contact: null,
      rating: null,
      notes: null,
      agent_city: agent.agent_city ?? null,
      agent_state: agent.agent_state ?? null,
      source: "other",
    });
    progress.current.target = created;
    return created;
  };

  const agentPatch = (who: Agent, own: boolean): AgentPatchPayload => {
    const patch: AgentPatchPayload = {};
    // Only a reached call can pin a class — guarded here as well as in the UI.
    if (outcome === "reached" && showQuestion && cls) {
      patch.agent_class = cls;
      if (cls === "spot" && parkNow) {
        patch.work_status = "parked";
        if (parkReason.trim()) patch.park_reason = parkReason.trim();
      }
    }
    const ph = phone.trim() || null;
    if (own) {
      if (freightTouched) patch.freight_types = freight;
      if (bestTouched) patch.best_time_to_call = best;
      if (ph !== (agent.phone ?? null)) patch.phone = ph;
    } else {
      // Who answered gets only what THIS call captured — the chips and the
      // best time were prefilled from the dialed record, so an untouched
      // prefill is never written onto another human, nothing blank is written
      // over them, and their own phone is kept if they have one (the dialed
      // line reached them, but it may be the office's, not theirs). The same
      // touched-rule the footprint head counts by (targetFreight / targetBest).
      if (freightTouched && freight.length > 0 && !sameList(who.freight_types, freight)) patch.freight_types = freight;
      if (bestTouched && best && best !== (who.best_time_to_call ?? null)) patch.best_time_to_call = best;
      if (ph && !who.phone) patch.phone = ph;
    }
    return patch;
  };

  const logCall = async (mode: WriteMode) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    let stage = "The call";
    try {
      // 1. who this call files under
      stage = "The new agent";
      const who = await resolveTarget();
      const own = who.agent_id === agent.agent_id;
      const noteOut = foldNote(note, lane, regular, season, own ? null : `diverted from ${name}`);

      // 2. the contact — as it happened, never folded (THE CAP); "anyway"
      //    stamps cap_override so the record says the cap was seen.
      stage = "The call";
      let createdId = progress.current.contactId;
      if (!createdId) {
        const input: CreateAgentContactInput = {
          agent_id: who.agent_id,
          direction: "outbound",
          method: "call",
          type,
          outcome,
          next_step: nextStep,
          next_step_at: nextStep === "call_back" ? nextStepAt : null,
          footprint_captured: captured,
          note: noteOut,
          cap_override: mode === "anyway",
        };
        const created = await createAgentContact(input);
        createdId = created.contact_id;
        progress.current.contactId = createdId;
      }

      // 3. the breadcrumb on the dialed record — the ONLY thing it receives
      if (!own && !progress.current.breadcrumb) {
        stage = "The breadcrumb";
        await createAgentNote(agent.agent_id, {
          note: `Called this record — ${nameOf(who)} answered; the call and its intel are filed on their record.`,
          created_by: initialsOf(signedInName()),
        });
        progress.current.breadcrumb = true;
      }

      // 4. the agent — LAST
      stage = "The agent's record";
      const patch = agentPatch(who, own);
      if (Object.keys(patch).length > 0) await patchAgent(who.agent_id, patch);

      const id = createdId;
      notify(`Logged · ${nameOf(who)} · ${contactTypeLabel(type)}`, {
        label: "undo",
        run: async () => {
          await deleteAgentContact(id);
          await reload();
        },
      });
      // The reload lands the new contact in the list; the parent advances
      // from the CURRENT list after it renders (CallsView's pending advance).
      await reload();
      setBusy(false);
      onLogged(agent.agent_id, !own);
    } catch (e) {
      // Named, and honest about what already saved — a retry skips it.
      const msg = e instanceof Error ? e.message : "try again";
      const logged = progress.current.contactId != null;
      setErr(
        logged && stage !== "The call"
          ? `The call is logged, but ${stage.toLowerCase()} didn't save — ${msg}. Tap Log & next to retry what's left.`
          : `${stage} didn't save — ${msg}.`,
      );
      setBusy(false);
    }
  };

  const toggleFreight = (f: string) => setFreight((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
  const positionPill = (
    <StatusPill tone="amber">{position ? `${position.index + 1} of ${position.total}` : recycled ? "next rotation" : "off today's list"}</StatusPill>
  );
  const prefers = prefersWord(agent.preferred_contact);
  const headLine = [
    bucketLabel(bucket),
    `${delivered.length} load${delivered.length === 1 ? "" : "s"}`,
    prefers ? `prefers ${prefers}` : null,
    agent.best_time_to_call ? `best time ${agent.best_time_to_call}` : null,
  ]
    .filter((s): s is string => s != null)
    .join(" · ");

  return (
    <section
      aria-label={`Call ${name}`}
      className="fixed inset-0 z-40 bg-canvas flex flex-col md:static md:z-auto md:bg-transparent md:block"
    >
      {/* phone top bar — the sheet's back chevron and n of N */}
      <div className="md:hidden flex items-center gap-2 pl-1 pr-3 h-12 border-b border-hairline shrink-0">
        <button type="button" onClick={onBack} aria-label="Back to the list" className="w-11 h-11 grid place-items-center text-dim hover:text-ink">
          <ChevronLeft size={22} />
        </button>
        {positionPill}
        <span className="ml-auto font-condensed text-[12px] text-faint uppercase tracking-[.1em]">
          {working === "reactivation" ? "Reactivation" : "Prospecting"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto md:overflow-visible">
        {/* ---- header ---- */}
        <div className="px-4 md:px-5 pt-4 pb-3 border-b border-hairline">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Link to={`/agents/${agent.agent_id}`} className="font-display text-[26px] text-amber leading-none hover:text-hot transition-colors">
              {name}
            </Link>
            <CodeChip code={agent.broker_name} />
            <StatusPill tone={classChip.label === "Direct" ? "good" : "neutral"}>
              {classChip.label}
              {classChip.derived ? " · from loads" : ""}
            </StatusPill>
            {dialedCap.blocked && dialedCap.first && (
              <span title="already had a proactive touch this week — the one-a-week cap (REL-01 §4)" className="inline-flex">
                <StatusPill tone="amber">
                  touched {weekdayShort(dialedCap.first.contacted_at)} · {contactTypeLabel(dialedCap.first.type)}
                </StatusPill>
              </span>
            )}
            {badNumber && <StatusPill tone="bad">bad #</StatusPill>}
            <span className="hidden md:inline-flex ml-auto">{positionPill}</span>
          </div>
          <p className="font-condensed text-[13.5px] text-dim mt-1.5">{headLine}</p>
          <div className="flex gap-2 flex-wrap mt-3">
            {agent.phone && (
              <span className="hidden md:inline-flex">
                <PrimaryLink size="lg" href={telHref(agent.phone)}>
                  <Phone size={16} /> Call {agent.phone}
                </PrimaryLink>
              </span>
            )}
            {agent.phone && (
              <GhostLink size="lg" href={smsHref(agent.phone)}>
                <MessageSquare size={15} /> Text
              </GhostLink>
            )}
            {agent.email && (
              <GhostLink size="lg" href={`mailto:${agent.email}`}>
                <Mail size={15} /> Email
              </GhostLink>
            )}
            {!agent.phone && <span className="font-condensed text-[13px] text-faint self-center">no phone on file — question 6 below</span>}
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <Stat label="Loads" value={String(delivered.length)} sub={delivered.length ? `${money(gross / delivered.length)} avg` : "never ran"} />
            <Stat label="Last contact" value={lastDays == null ? "never" : `${lastDays}d`} sub={lastSub} />
            <Stat label="Market" value={topMarket ?? "—"} sub={`grade ${grade}`} />
          </div>

          <Well className="px-3 py-2.5 flex items-center gap-3 mt-3">
            <span className="text-[11px] uppercase tracking-[.12em] text-amber font-condensed shrink-0">Why they're on the list</span>
            <span className="text-[13.5px] text-ink/90">{why ?? "not on today's list — the call still files against their record"}</span>
          </Well>
        </div>

        {/* ---- script ---- */}
        <SectionHead
          right={
            <button type="button" onClick={() => setScriptOpen((v) => !v)} className="inline-flex items-center gap-1 hover:text-hot" aria-expanded={scriptOpen}>
              {scriptOpen ? (
                <>
                  hide <ChevronUp size={13} />
                </>
              ) : (
                <>
                  show <ChevronDown size={13} />
                </>
              )}
            </button>
          }
        >
          Script · {script.ref}
        </SectionHead>
        {scriptOpen && (
          <div className="px-4 md:px-5 pb-3 grid gap-2">
            <p className="text-[13.5px] text-dim leading-relaxed">
              <span className="font-condensed text-[11px] uppercase tracking-[.1em] text-amber-hi mr-2">Opener</span>“{script.opener}”
            </p>
            <p className="text-[13px] text-faint leading-relaxed">
              <span className="font-condensed text-[11px] uppercase tracking-[.1em] text-amber-hi mr-2">Voicemail</span>“{script.voicemail}”
            </p>
            <p className="font-condensed text-[11.5px] text-faint">
              suggested language — say it your way. Reached and willing → the footprint below, then ask for freight.
            </p>
          </div>
        )}

        {/* ---- the footprint ---- */}
        <SectionHead
          right={
            <button
              type="button"
              aria-pressed={captured}
              onClick={() => setCapturedManual({ target: targetKey, on: !captured })}
              title="Writes footprint_captured on this call — auto-suggested when a market, a freight type and a best time are on file"
              className="inline-flex"
            >
              <StatusPill tone={captured ? "good" : "neutral"}>Footprint captured{manualCaptured == null ? "" : " · set by you"}</StatusPill>
            </button>
          }
        >
          <span className="inline-flex items-center gap-3">
            The footprint · {score} of {FOOTPRINT_QUESTIONS}
            <span className="inline-flex w-[84px]">
              <MeterCells pct={score / FOOTPRINT_QUESTIONS} cells={FOOTPRINT_QUESTIONS} />
            </span>
          </span>
        </SectionHead>
        <ul className="px-4 md:px-5 pb-2">
          <Question n={1} text="Which shippers, out of which cities?" done={parts.markets}>
            <FieldLabel>Markets they cover</FieldLabel>
            {hauledFrom.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-2">
                {hauledFrom.map((m) => (
                  <span
                    key={`${m.city},${m.state}`}
                    title="Proven — a load has come out of this market"
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[8px] border border-status-positive-text/60 bg-status-positive-text/10 font-condensed text-[12.5px] text-ink"
                  >
                    {m.city.toUpperCase()} {m.state.toUpperCase()} <span className="text-dim">×{m.n}</span>
                  </span>
                ))}
              </div>
            )}
            {creating ? (
              <p className="font-condensed text-[12.5px] text-faint">
                markets file under {divertWords.join(" ")} once they exist — add them from their sheet after the call
              </p>
            ) : (
              <CoverageEditor agentId={target?.agent_id ?? agent.agent_id} rows={stated} onChanged={() => void reload()} emptyText="No stated markets yet — dashed = they said so, solid = a load proved it" />
            )}
          </Question>

          <Question n={2} text="What moves most?" done={parts.freight}>
            <div className="flex flex-wrap gap-2">
              {LOAD_TYPES.map((f) => (
                <button key={f} type="button" aria-pressed={freight.includes(f)} onClick={() => toggleFreight(f)} className={`${TAG} ${freight.includes(f) ? TAG_ON : TAG_OFF}`}>
                  {f}
                </button>
              ))}
            </div>
            {(agent.freight_types?.length ?? 0) > 0 && freightTouched && (
              <p className="font-condensed text-[11.5px] text-faint mt-1.5">changed — writes on Log & next{freight.length === 0 ? " (clears what was on file)" : ""}</p>
            )}
            {!targetIsDialed && !freightTouched && freight.length > 0 && (
              <p className="font-condensed text-[11.5px] text-faint mt-1.5">prefilled from {agent.first_name}'s record — counts for who answered only once you change it</p>
            )}
          </Question>

          <Question n={3} text={`Typical lane out of ${hauledFrom[0]?.city ?? target?.agent_city ?? agent.agent_city ?? "their market"}?`} done={parts.lane}>
            <input value={lane} onChange={(e) => setLane(e.target.value)} placeholder={markers.lane ? "on file from an earlier call — add if it changed" : "Savannah → Atlanta, most weeks"} maxLength={160} className="ds-input" />
          </Question>

          <Question n={4} text="Anything regular the truck could be part of?" done={parts.regular}>
            <input value={regular} onChange={(e) => setRegular(e.target.value)} placeholder={markers.regular ? "on file — add if it changed" : "coils every other Tuesday"} maxLength={160} className="ds-input" />
          </Question>

          <Question n={5} text="What's moving now — when's busy season?" done={parts.season}>
            <input value={season} onChange={(e) => setSeason(e.target.value)} placeholder={markers.season ? "on file — add if it changed" : "slow now · spring is the push"} maxLength={160} className="ds-input" />
          </Question>

          <Question n={6} text="Best number and best time to call?" done={parts.bestTime}>
            {badNumber && (
              <p className="font-condensed text-[12.5px] text-status-negative-text mb-2">
                the last call came back bad number — fix the phone here and it writes on Log & next
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <FieldLabel htmlFor="call-phone">Phone{phone.trim() !== (agent.phone ?? "") ? " · changed" : " · confirm"}</FieldLabel>
                <input id="call-phone" type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} className="ds-input" />
              </div>
              <div>
                <FieldLabel htmlFor="call-best">Best time to call</FieldLabel>
                <input id="call-best" value={bestTime} onChange={(e) => setBestTime(e.target.value)} placeholder="mornings before 10" maxLength={80} className="ds-input" />
              </div>
            </div>
          </Question>
        </ul>

        {/* ---- outcome ---- */}
        <SectionHead>Outcome</SectionHead>
        <div className="px-4 md:px-5 pb-3">
          <SegmentedTabs tabs={OUTCOME_TABS} value={outcome} onChange={pickOutcome} size="sm" ariaLabel="Outcome" />
          {outcome !== "reached" && <p className="font-condensed text-[11.5px] text-faint mt-1.5">nobody spoken to — no class can be pinned, and the quiet clock keeps running</p>}
        </div>

        {/* ---- the one question ---- */}
        {outcome === "reached" && classAgent != null && classAgent.relationship_tier == null && (
          <>
            <SectionHead>The one question — do they have their own customers?</SectionHead>
            <div className="px-4 md:px-5 pb-3">
              {pinned && !changeClass ? (
                <div className="flex items-center gap-2 flex-wrap font-condensed text-[13.5px] text-dim">
                  <StatusPill tone={classAgent.agent_class === "direct" ? "good" : "neutral"}>{classAgent.agent_class} · pinned</StatusPill>
                  <span>answered on an earlier call</span>
                  <button type="button" onClick={() => setChangeClass(true)} className="ml-auto text-[12px] text-amber-hi hover:text-hot">
                    change
                  </button>
                </div>
              ) : (
                <>
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
                        <input value={parkReason} onChange={(e) => setParkReason(e.target.value)} placeholder="Reason — optional for spot" className="ds-input mt-2" />
                      )}
                    </div>
                  )}
                  {changeClass && (
                    <button type="button" onClick={() => { setChangeClass(false); setCls(null); }} className="font-condensed text-[12px] text-faint hover:text-ink mt-1.5">
                      keep {classAgent.agent_class}
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
        {outcome === "reached" && classAgent != null && classAgent.relationship_tier != null && (
          <p className="px-4 md:px-5 pb-3 font-condensed text-[12px] text-faint">the one question is settled — the owner set a tier</p>
        )}

        {/* ---- next step ---- */}
        <SectionHead>Next step</SectionHead>
        <div className="px-4 md:px-5 pb-3">
          <SegmentedTabs tabs={NEXT_TABS} value={nextStep} onChange={setNextStep} size="sm" ariaLabel="Next step" />
          {nextStep === "call_back" && (
            <div className="flex items-center gap-2 flex-wrap mt-2">
              {chips.map((c) => (
                <button key={c.label} type="button" onClick={() => setNextStepAt(c.key)} className={`${CHIP_BTN} ${nextStepAt === c.key ? CHIP_ON : CHIP_OFF}`}>
                  {c.label}
                </button>
              ))}
              <input type="date" aria-label="Pick a date" value={nextStepAt ?? ""} onChange={(e) => setNextStepAt(e.target.value || null)} className="ds-input h-8 w-auto text-[13px]" />
            </div>
          )}
        </div>

        {/* ---- note ---- */}
        <SectionHead>Note</SectionHead>
        <div className="px-4 md:px-5 pb-3">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="what happened · what was promised · what's owed · load # if any" className="ds-input" />
          {(lane.trim() || regular.trim() || season.trim()) && (
            <p className="font-condensed text-[11.5px] text-faint mt-1.5 truncate">
              logs as: {foldNote(note, lane, regular, season, null)}
            </p>
          )}
        </div>

        {/* ---- divert: someone else answered ---- */}
        <div className="px-4 md:px-5 pb-4">
          {!divertOpen ? (
            <button
              type="button"
              onClick={() => setDivertOpen(true)}
              className="inline-flex items-center gap-1.5 font-condensed text-[12.5px] border-b border-dotted hover:text-ink"
              style={{ color: "var(--color-chart-blue)", borderColor: "rgba(79,140,214,.4)" }}
            >
              <CornerDownRight size={14} /> Someone else answered — file this call under them
            </button>
          ) : (
            <div className="rounded-[9px] p-3" style={{ background: "rgba(79,140,214,.06)", border: "1px solid rgba(79,140,214,.35)" }}>
              <div className="flex items-center gap-2 mb-2">
                <CornerDownRight size={14} style={{ color: "var(--color-chart-blue)" }} />
                <p className="font-condensed text-[12px] text-dim">Who actually answered — any agent, any code; the person is the anchor.</p>
                <button
                  type="button"
                  onClick={() => {
                    setDivertOpen(false);
                    setDivertName("");
                    setDivertPick(null);
                  }}
                  className="ml-auto font-condensed text-[11px] uppercase tracking-[.1em] text-faint hover:text-ink"
                >
                  cancel
                </button>
              </div>
              {divertPick ? (
                <div className="flex items-center gap-2 flex-wrap font-condensed text-[13.5px]">
                  <span className="text-ink font-semibold">{nameOf(divertPick)}</span>
                  <CodeChip code={divertPick.broker_name} />
                  <span className="text-dim">found</span>
                  <button
                    type="button"
                    onClick={() => {
                      // Clear the name with the pick — a name that still matched
                      // exactly would only pick the same person straight back.
                      setDivertPick(null);
                      setDivertName("");
                    }}
                    className="ml-auto text-[12px] text-amber-hi hover:text-hot"
                  >
                    change
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={divertName}
                    onChange={(e) => onDivertName(e.target.value)}
                    placeholder="Their name (first and last)"
                    aria-label="Who answered"
                    autoComplete="off"
                    className="ds-input"
                  />
                  {divertMatches.length > 0 && (
                    <ul className="mt-2 grid gap-1">
                      {divertMatches.map((a) => (
                        <li key={a.agent_id}>
                          <button
                            type="button"
                            onClick={() => setDivertPick(a)}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[6px] font-condensed text-[14px] text-ink hover:bg-white/5 text-left"
                          >
                            {nameOf(a)} <CodeChip code={a.broker_name} />
                            {a.agent_city && <span className="text-faint text-[12px]">{a.agent_city}{a.agent_state ? `, ${a.agent_state}` : ""}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {divertIncomplete && <p className="font-condensed text-[11.5px] text-faint mt-1.5">first and last name — or pick a match above</p>}
                  {creating && (
                    <div className="flex items-end gap-2 flex-wrap mt-2">
                      <span className="font-condensed text-[13px] text-dim">
                        create <b className="text-ink">{divertWords.join(" ")}</b> on
                      </span>
                      <input
                        value={divertCode}
                        onChange={(e) => setDivertCode(e.target.value.toUpperCase())}
                        placeholder="code — optional"
                        aria-label="Agency code for the new agent"
                        maxLength={10}
                        className="ds-input w-[130px] uppercase tracking-[.08em]"
                      />
                      <span className="font-condensed text-[11.5px] text-faint">
                        {divertCode.trim()
                          ? brokers.some((b) => b.broker_name.toUpperCase() === divertCode.trim().toUpperCase())
                            ? "an existing code"
                            : "a new code — created on log"
                          : "no code — they wear NO CODE"}
                      </span>
                    </div>
                  )}
                </>
              )}
              {diverting && (
                <p className="font-condensed text-[11.5px] text-faint mt-2 leading-snug">
                  Everything from this call — outcome, class, freight, best time, the note, the contact — files under{" "}
                  <b className="text-ink">{divertPick ? nameOf(divertPick) : divertWords.join(" ")}</b>
                  {divertPick ? "" : divertCode.trim() ? ` (created on ${divertCode.trim().toUpperCase()})` : " (created with no code)"}.{" "}
                  {agent.first_name}'s record gets one breadcrumb note and nothing else — you stay on their card to skip or park them.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---- footer — the thumb bar on the phone ---- */}
      <div className="shrink-0 sticky bottom-0 bg-panel border-t border-hairline px-3 py-2.5 md:static md:bg-transparent md:border-hairline-lo md:px-5 md:py-4">
        <ErrorLine>{err}</ErrorLine>
        {agent.phone && (
          <div className="md:hidden mb-2">
            <PrimaryLink size="lg" href={telHref(agent.phone)} className="w-full">
              <Phone size={16} /> Call {agent.phone}
            </PrimaryLink>
          </div>
        )}
        {capped && cap?.first ? (
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              {/* No onFold — a call is never folded (THE CAP): the gate offers
                  "Log anyway" only, with the note as the reason. */}
              <CapGate
                firstName={capFirstName}
                first={cap.first}
                type={type}
                carried={carried}
                busy={busy}
                noteEmpty={note.trim().length === 0}
                onLogAnyway={() => void logCall("anyway")}
                logAnywayLabel="Log anyway & next"
              />
            </div>
            <GhostButton size="lg" disabled={busy} onClick={onSkip}>
              Skip
            </GhostButton>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <PrimaryButton
              size="lg"
              className="flex-1"
              disabled={busy || divertIncomplete}
              title={divertIncomplete ? "Finish the name, or pick a match" : undefined}
              onClick={() => void logCall("log")}
            >
              {busy ? "Saving…" : "Log & next"}
            </PrimaryButton>
            <GhostButton size="lg" disabled={busy} onClick={onSkip}>
              Skip
            </GhostButton>
          </div>
        )}
      </div>
    </section>
  );
};
