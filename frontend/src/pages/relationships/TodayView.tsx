import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Check, Copy, Lock, Phone } from "lucide-react";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import { useIsMobile } from "@/hooks/use-mobile";
import { ForgedPlate, Well } from "@/components/ui/ForgedPlate";
import { createAgentContact, deleteAgentContact, type AgentContact, type CreateAgentContactInput } from "@/services/agentContactsService";
import { createAgentNote } from "@/services/createAgentNoteService";
import { copyText } from "@/lib/clipboard";
import { money } from "@/lib/format";
import { nameOf } from "@/lib/relationships/nameOf";
import { shortDate } from "@/lib/relationships/dayKeys";
import { contactTypeLabel } from "@/lib/relationships/contactTypes";
import { alreadyCarries } from "@/lib/relationships/contactCap";
import { skippedMarker } from "@/lib/relationships/markers";
import { emptyTense, emptyWhenLabel, placeLabel, roundMiles, type EmptyNext } from "@/lib/relationships/capacityList";
import { fiveText } from "@/lib/relationships/fridayFive";
import { PLATE_LABEL } from "@/lib/relationships/dayPlan";
import {
  methodFor,
  nurtureAgent,
  nurtureLabel,
  nurtureMarker,
  nurtureType,
  type NurtureFlag,
  type Plate,
  type QueueRow,
  type QueueSection,
  type TodayModel,
} from "@/lib/relationships/todayQueue";
import type { CoolingRow } from "@/lib/relationships/cooling";
import {
  capacityDraft150,
  capacityText150,
  closeOutDraft,
  draftText,
  holidayDraft,
  holidaySentence,
  milestoneDraft,
  milestoneSentence,
  type Draft,
  type Signer,
} from "@/lib/relationshipTemplates";
import { AgentRow, type RowChip } from "@/components/relationships/AgentRow";
import { CodeChip, ErrorLine, GhostButton, PrimaryButton, PrimaryLink, SectionHead } from "@/components/relationships/primitives";
import type { TouchPrefill } from "@/components/relationships/LogTouchForm";
import { useRelationships } from "./context";

// TODAY — the plate is the day's job, the queue beneath it does the thinking
// (ADMIN-02 v1.1's week; REL-01 v2.0's cap). Everything here is manual: Copy
// and Log are separate acts, nothing sends, there is no "log all". The rows
// and the counts come from lib/relationships/todayQueue, built once in the
// layout; this file only draws them and writes what Brandie taps.

const SECTION_CHIP: Record<QueueSection, RowChip> = {
  NOW: { kind: "now", label: "Now" },
  CAPACITY: { kind: "now", label: "Capacity" },
  NURTURE: { kind: "section", label: "Nurture" },
  "CALL BACK": { kind: "callback", label: "Call back" },
  REACTIVATION: { kind: "section", label: "Reactivation" },
  PROSPECTING: { kind: "section", label: "Prospecting" },
};

const COPIED_MS = 2000;

const telHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, "")}`;

// Up to five initials for agent_notes.created_by (VARCHAR(5)); "DISP" when
// no name is on file — the note is Dispatch's either way.
const initialsOf = (signer: Signer): string => {
  const init = (signer ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase())
    .join("")
    .slice(0, 5);
  return init || "DISP";
};

const nurtureDraft = (f: NurtureFlag, signer: Signer): Draft =>
  f.type === "milestone" ? milestoneDraft(f.flag.kind, f.flag.n, f.flag.agent, signer, f.flag.years) : holidayDraft(f.flag.kind, f.flag.agent, signer, f.flag.year);

// The sentence a second reason adds to Monday's capacity message.
const nurtureSentence = (f: NurtureFlag): string =>
  f.type === "milestone" ? milestoneSentence(f.flag.kind, f.flag.n, f.flag.years) : holidaySentence(f.flag.kind, f.flag.year);

// ---- plate furniture ----
const Chip = ({ tone, children }: { tone: "day" | "job" | "dim"; children: ReactNode }) => (
  <span
    className={`inline-flex items-center h-[22px] px-2 rounded-[5px] font-condensed font-semibold text-[11px] tracking-[.06em] uppercase ${
      tone === "day" ? "bg-well text-hot" : tone === "job" ? "bg-amber text-canvas" : "bg-dim/10 text-dim"
    }`}
  >
    {children}
  </span>
);

const Cell = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="min-w-0">
    <p className="font-condensed text-[11px] tracking-[.12em] uppercase text-faint">{label}</p>
    <p className="font-display text-[24px] leading-none mt-1 tabular-nums text-ink">{value}</p>
    {sub && <p className="text-[12px] text-dim mt-1 leading-snug">{sub}</p>}
  </div>
);

const Hero = ({ agent }: { agent: Agent }) => (
  <p className="mt-3 flex items-center gap-2.5 flex-wrap">
    <Link to={`/agents/${agent.agent_id}`} className="font-display text-[26px] text-amber leading-none hover:text-hot transition-colors">
      {nameOf(agent)}
    </Link>
    <CodeChip code={agent.broker_name} />
  </p>
);

// The draft cavity — collapsed to one line, "show full" opens it; the
// optional right slot carries the email | text switch.
const DraftWell = ({ text, right }: { text: string; right?: ReactNode }) => {
  const [full, setFull] = useState(false);
  const long = text.length > 150 || text.includes("\n");
  return (
    <Well className="mt-3 px-3 py-2.5 flex gap-3 items-start">
      <span className="font-condensed text-[11px] tracking-[.12em] uppercase text-amber shrink-0 mt-0.5">Draft</span>
      <div className="min-w-0 flex-1">
        <p className={`text-[13.5px] text-ink/90 leading-snug ${full ? "whitespace-pre-wrap" : "truncate"}`}>{text}</p>
        <p className="flex items-center gap-2 mt-1 font-condensed text-[12px] text-amber-hi">
          {long && (
            <button type="button" onClick={() => setFull((v) => !v)} className="hover:text-hot">
              {full ? "show less" : "show full"}
            </button>
          )}
          {right}
        </p>
      </div>
    </Well>
  );
};

// Copy → toast + a ✓ that flips back after two seconds.
const CopyButton = ({ text, label = "Copy", onCopied, size = "sm" }: { text: string; label?: string; onCopied: () => void; size?: "sm" | "md" }) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <PrimaryButton
      size={size}
      onClick={() => {
        copyText(text);
        setCopied(true);
        onCopied();
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : label}
    </PrimaryButton>
  );
};

// The plate's Call / Log: a sticky thumb bar on the phone, inline on md+.
// The bar is portaled to <body>: the forged plate carries will-change:
// transform and a chamfer clip-path, either of which would pin and clip a
// fixed child inside it.
const PlateActions = ({ mobile, children }: { mobile: boolean; children: ReactNode }) =>
  mobile ? (
    createPortal(
      <div className="fixed bottom-0 inset-x-0 z-40 h-14 bg-panel border-t border-hairline flex items-center gap-2 px-4 overflow-x-auto">{children}</div>,
      document.body,
    )
  ) : (
    <div className="flex items-center gap-2.5 flex-wrap mt-3">{children}</div>
  );

const ForemanDoor = ({ children }: { children: ReactNode }) => (
  <Link to="/foreman" className="font-condensed font-semibold text-[12.5px] text-amber-hi hover:text-hot">
    {children} →
  </Link>
);

// The empty-next chip's word, by TENSE (never by the label's spelling): the
// truck sits empty now · a committed load with no delivery date yet · the day.
const emptyChipWord = (anchor: EmptyNext): string => {
  switch (emptyTense(anchor)) {
    case "now":
      return `empty ${placeLabel(anchor)} now`;
    case "unscheduled":
      return `empty ${placeLabel(anchor)} · no delivery date yet`;
    default:
      return `empty ${placeLabel(anchor)} · ${emptyWhenLabel(anchor, "short")}`;
  }
};

// ---- the plates ----
interface PlateProps {
  today: TodayModel;
  plate: Plate;
  loads: Load[];
  signer: Signer;
  mobile: boolean;
  busy: string | null;
  error: string | null;
  onOpen: (agent: Agent, prefill: TouchPrefill) => void;
  onLog: (key: string, agent: Agent, input: Omit<CreateAgentContactInput, "agent_id">, label: string) => void;
  onSkip: (flag: NurtureFlag) => void;
  onCopied: (what: string) => void;
}

const CapacityPlate = ({ today, plate, signer, mobile, busy, error, onLog, onCopied }: PlateProps & { plate: Extract<Plate, { kind: "capacity" }> }) => {
  const [variant, setVariant] = useState<"email" | "text">("email");
  const { anchor, list, hero, heroFlag, combined } = plate;
  const fold = heroFlag ? nurtureSentence(heroFlag) : null;
  const email = hero && anchor ? capacityDraft150(hero.agent, anchor, hero.miles, signer, fold) : null;
  const text = hero && anchor ? capacityText150(hero.agent, anchor, hero.miles, signer, fold) : null;
  const copyBody = variant === "email" && email ? draftText(email) : (text ?? "");

  let empty: ReactNode = null;
  if (!anchor) empty = <>No empty-next point yet — the Foreman needs a committed or delivered load. <ForemanDoor>Foreman</ForemanDoor></>;
  else if (!list.anchorResolved)
    empty = <>{placeLabel(anchor)} has no trusted coordinate yet — no miles to measure. The Foreman sharpens it as it geocodes. <ForemanDoor>Foreman</ForemanDoor></>;
  else if (!hero && list.rows.length > 0)
    empty = <>Everyone within 150 mi of {placeLabel(anchor)} still clear this week is owed a call back today — the heads-up waits for the call. Their rows are under CALL BACK below.</>;
  else if (!hero && list.touched.length > 0) empty = <>Everyone within 150 mi of {placeLabel(anchor)} already heard from you this week — one proactive touch each.</>;
  else if (!hero) empty = <>Nobody in the book within 150 mi of {placeLabel(anchor)} — the Foreman's region view is the next best list. <ForemanDoor>Foreman</ForemanDoor></>;

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Chip tone="day">{today.plan.short}</Chip>
        <Chip tone="job">{PLATE_LABEL.capacity}</Chip>
        {anchor && <Chip tone="dim">{emptyChipWord(anchor)}</Chip>}
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3.5">
        <Cell
          label="Within 150 mi"
          value={list.anchorResolved ? list.rows.length + list.touched.length : "—"}
          sub={
            <>
              in the book
              {list.parkedNearby > 0 && (
                <>
                  {" · "}
                  <ForemanDoor>+ {list.parkedNearby} parked nearby</ForemanDoor>
                </>
              )}
            </>
          }
        />
        <Cell label="Already touched this week" value={list.touched.length} sub="cap: one proactive touch each" />
        <Cell label="Combined with" value={combined} sub="milestone or holiday due" />
      </div>
      {hero && email && text ? (
        <>
          <Hero agent={hero.agent} />
          <p className="font-condensed text-[13px] text-dim mt-1">
            {placeLabel(hero.nearestPlace)} · about {roundMiles(hero.miles)} miles · prefers {methodFor(hero.agent.preferred_contact)}
            {heroFlag ? ` · ${nurtureLabel(heroFlag)} due — one combined message` : ""}
          </p>
          <DraftWell
            text={variant === "email" ? email.body : text}
            right={
              <span className="flex items-center gap-1.5">
                <span className="text-faint">·</span>
                <button type="button" onClick={() => setVariant("email")} className={variant === "email" ? "text-hot underline underline-offset-2" : "hover:text-hot"}>
                  email
                </button>
                <span className="text-faint">|</span>
                <button type="button" onClick={() => setVariant("text")} className={variant === "text" ? "text-hot underline underline-offset-2" : "hover:text-hot"}>
                  text
                </button>
              </span>
            }
          />
          <ErrorLine>{error}</ErrorLine>
          <PlateActions mobile={mobile}>
            <CopyButton text={copyBody} onCopied={() => onCopied(nameOf(hero.agent))} />
            <GhostButton
              size="sm"
              disabled={busy != null}
              onClick={() =>
                onLog(
                  `cap:${hero.agent.agent_id}`,
                  hero.agent,
                  {
                    direction: "outbound",
                    method: methodFor(hero.agent.preferred_contact),
                    type: "capacity",
                    note: heroFlag ? `${nurtureMarker(heroFlag)} folded into the capacity heads-up` : null,
                    combined_types: heroFlag ? [nurtureType(heroFlag)] : null,
                  },
                  heroFlag ? `Capacity heads-up + ${nurtureLabel(heroFlag)}` : "Capacity heads-up",
                )
              }
            >
              {busy === `cap:${hero.agent.agent_id}` ? "Logging…" : `Log sent → ${hero.agent.first_name}`}
            </GhostButton>
          </PlateActions>
        </>
      ) : (
        <p className="font-condensed text-[13.5px] text-dim mt-3 leading-snug">{empty}</p>
      )}
    </>
  );
};

const ReactivationPlate = ({ today, plate, mobile, onOpen }: PlateProps & { plate: Extract<Plate, { kind: "reactivation" }> }) => {
  const { hero, heroTouched, lapsed } = plate;
  // The cap's own rule (LogTouchForm): a second reason folds into the week's
  // message — unless that message already carries it, when there is nothing
  // to fold and only "log anyway" (with a reason) is left.
  const carried = heroTouched != null && alreadyCarries(heroTouched.contact, "reactivation");
  const prefill: TouchPrefill = { direction: "outbound", method: "call", type: "reactivation" };
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Chip tone="day">{today.plan.short}</Chip>
        <Chip tone="job">{PLATE_LABEL.reactivation}</Chip>
        <Chip tone="dim">{lapsed} lapsed</Chip>
      </div>
      {hero ? (
        <>
          <Hero agent={hero.agent} />
          <div className="grid grid-cols-3 gap-3 mt-3.5">
            <Cell label="Loads" value={hero.delivered} sub={`${money(hero.gross)} together${hero.lastLoad ? ` · last ${shortDate(hero.lastLoad)}` : ""}`} />
            <Cell label="Quiet" value={hero.quietDays == null ? "never" : `${hero.quietDays}d`} sub={hero.quietDays == null ? "no two-way contact yet" : "since two-way contact"} />
            <Cell label="Market" value={hero.place ?? "—"} sub="hauled from" />
          </div>
          <Well className="mt-3 px-3 py-2.5 flex gap-3 items-start">
            <span className="font-condensed text-[11px] tracking-[.12em] uppercase text-amber shrink-0 mt-0.5">Why</span>
            <p className="text-[13.5px] text-ink/90 leading-snug">
              {hero.delivered === 1 ? "One load" : `${hero.delivered} loads`} worth {money(hero.gross)}
              {hero.quietDays == null ? ", never a two-way contact" : `, ${hero.quietDays} days since`} — a warm re-open, not a cold call. Lead with the truck: where it goes empty, what it hauls.
            </p>
          </Well>
          {heroTouched && (
            <p className="font-condensed text-[12.5px] text-amber-hi mt-2">
              {contactTypeLabel(heroTouched.contact.type)} went out {heroTouched.day} — cap reached this week; everyone lapsed already heard from you.
              {carried ? " A reactivation is already in that message." : ""}
            </p>
          )}
          <PlateActions mobile={mobile}>
            {heroTouched ? (
              <GhostButton size="sm" onClick={() => onOpen(hero.agent, prefill)}>
                {carried ? "Log anyway" : `Fold into ${heroTouched.day}'s message`}
              </GhostButton>
            ) : (
              <>
                {hero.agent.phone ? (
                  <PrimaryLink size="sm" href={telHref(hero.agent.phone)}>
                    <Phone size={14} /> Call {hero.agent.phone}
                  </PrimaryLink>
                ) : (
                  <span className="font-condensed text-[12.5px] text-faint">no phone on file</span>
                )}
                <GhostButton size="sm" onClick={() => onOpen(hero.agent, prefill)}>
                  Log the call
                </GhostButton>
              </>
            )}
          </PlateActions>
        </>
      ) : (
        <p className="font-condensed text-[13.5px] text-dim mt-3 leading-snug">
          Nobody lapsed — every prospect who hauled has had a two-way contact inside six weeks.{" "}
          <Link to="/relationships/calls" className="text-amber-hi hover:text-hot">
            Call list →
          </Link>
        </p>
      )}
    </>
  );
};

const NurturePlate = ({ today, plate, signer, mobile, busy, error, onOpen, onLog, onSkip, onCopied }: PlateProps & { plate: Extract<Plate, { kind: "nurture" }> }) => {
  const { hero, heroTouched, heroStreak, heroWeekTouches, open } = plate;
  const agent = hero ? nurtureAgent(hero) : null;
  const draft = hero && agent ? nurtureDraft(hero, signer) : null;
  const crossed = hero ? (hero.type === "milestone" ? hero.flag.crossedOn : hero.flag.day) : null;
  // Flags that are open but not offered today — their agent is owed a call
  // back, and one reason per agent per day means the flag waits for the call.
  const held = today.flags.length - open;
  // LogTouchForm's own rule: a reason this week's message already carries has
  // nothing to fold — Skip, or log anyway with a reason.
  const carried = hero != null && heroTouched != null && alreadyCarries(heroTouched.contact, nurtureType(hero));
  const prefill = (f: NurtureFlag, a: Agent): TouchPrefill => ({ direction: "outbound", method: methodFor(a.preferred_contact), type: nurtureType(f), note: `${nurtureMarker(f)} ` });
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Chip tone="day">{today.plan.short}</Chip>
        <Chip tone="job">{PLATE_LABEL.nurture}</Chip>
        <Chip tone="dim">{open} flagged</Chip>
        {held > 0 && <Chip tone="dim">{held} on a call back</Chip>}
      </div>
      {hero && agent && draft ? (
        <>
          <Hero agent={agent} />
          <div className="grid grid-cols-3 gap-3 mt-3.5">
            <Cell
              label={hero.type === "milestone" ? "Milestone" : "Holiday"}
              value={nurtureLabel(hero)}
              sub={`${crossed ? `${hero.type === "milestone" ? "crossed" : ""} ${shortDate(crossed)} · ` : ""}not yet sent`}
            />
            <Cell
              label="This week"
              value={heroWeekTouches}
              sub={
                heroTouched
                  ? carried
                    ? `${contactTypeLabel(heroTouched.contact.type)} went out ${heroTouched.day} — nothing to fold`
                    : `proactive touch ${heroTouched.day} · fold this in`
                  : "proactive touches · clear to send"
              }
            />
            <Cell label="Streak" value={heroStreak} sub="on time, claim-free" />
          </div>
          {hero.type === "holiday" && agent.relationship_tier === 1 && (
            <p className="font-condensed text-[12.5px] text-amber-hi mt-2">Tier 1 — the owner personalizes this one.</p>
          )}
          <DraftWell text={draft.body} />
          <ErrorLine>{error}</ErrorLine>
          <PlateActions mobile={mobile}>
            {heroTouched ? (
              carried ? (
                <GhostButton size="sm" onClick={() => onOpen(agent, prefill(hero, agent))}>
                  Log anyway
                </GhostButton>
              ) : (
                <PrimaryButton size="sm" onClick={() => onOpen(agent, prefill(hero, agent))}>
                  Fold into {heroTouched.day}'s message
                </PrimaryButton>
              )
            ) : (
              <>
                <CopyButton text={draftText(draft)} onCopied={() => onCopied(nameOf(agent))} />
                <GhostButton
                  size="sm"
                  disabled={busy != null}
                  onClick={() =>
                    onLog(
                      `nurture:${agent.agent_id}:${nurtureMarker(hero)}`,
                      agent,
                      { direction: "outbound", method: methodFor(agent.preferred_contact), type: nurtureType(hero), note: `${nurtureMarker(hero)} ${nurtureLabel(hero)}` },
                      nurtureLabel(hero),
                    )
                  }
                >
                  {busy === `nurture:${agent.agent_id}:${nurtureMarker(hero)}` ? "Logging…" : "Log sent"}
                </GhostButton>
              </>
            )}
            <GhostButton size="sm" disabled={busy != null} onClick={() => onSkip(hero)}>
              {busy === `skip:${nurtureMarker(hero)}` ? "Skipping…" : "Skip this one"}
            </GhostButton>
          </PlateActions>
        </>
      ) : held > 0 ? (
        <p className="font-condensed text-[13.5px] text-dim mt-3 leading-snug">
          {held === 1 ? "The one flagged agent is" : `All ${held} flagged agents are`} owed a call back today — the note waits for the call. Their rows are under CALL BACK below.
        </p>
      ) : (
        <p className="font-condensed text-[13.5px] text-dim mt-3 leading-snug">
          Nothing flagged — no load-count, streak or anniversary crossing waiting, and no holiday inside its window. Milestones flag at 5 · 10 · 25 · 50 · 100 loads, streaks at 10 · 20 · 50.
        </p>
      )}
    </>
  );
};

const FivePlate = ({ today, plate, onCopied }: PlateProps & { plate: Extract<Plate, { kind: "five" }> }) => {
  const { five, hygiene } = plate;
  const weekWord = `${shortDate(five.week.startKey)} – ${shortDate(five.week.endKey)}`;
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Chip tone="day">{today.plan.short}</Chip>
        <Chip tone="job">{PLATE_LABEL.five}</Chip>
        <Chip tone="dim">Sat {weekWord}</Chip>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mt-3.5">
        <Cell label="Agents contacted" value={five.contacted} sub={five.contactedUntimed ? "reached · (some untimed)" : "reached on a call"} />
        <Cell label="Footprints" value={five.footprints} sub="captured this week" />
        <Cell label="Inbound offers" value={five.inboundOffers} sub="the leading indicator" />
        <Cell label="Above break-even" value={five.aboveBreakEven ? `${five.aboveBreakEven.n} of ${five.aboveBreakEven.m}` : "—"} sub={five.aboveBreakEven ? "booked this week, all-in ≥ walk-away" : "nothing booked, or no ladder"} />
        <Cell label="Days empty" value={five.daysEmpty} sub="so far this week" />
      </div>
      <div className="flex items-center gap-2.5 flex-wrap mt-3">
        <CopyButton text={fiveText(five)} label="Copy the five" onCopied={() => onCopied("the five")} />
        <span className="font-condensed text-[12.5px] text-faint">plain text — paste it to the owner</span>
      </div>
      <div className="mt-3.5 border-t border-white/10 pt-3">
        <p className="font-condensed text-[11px] tracking-[.12em] uppercase text-faint">Hygiene</p>
        {hygiene.length === 0 ? (
          <p className="font-condensed text-[13px] text-dim mt-1">every active agent has a phone, a preferred channel and a footprint</p>
        ) : (
          <ul className="mt-1 grid gap-1">
            {hygiene.map((h) => (
              <li key={h.key} className="font-condensed text-[13px] text-dim">
                <b className="text-ink font-semibold">{h.agents.length}</b> {h.label} —{" "}
                {h.agents.slice(0, 3).map((a, i) => (
                  <span key={a.agent_id}>
                    {i > 0 && ", "}
                    <Link to={`/relationships/tiers?q=${encodeURIComponent(nameOf(a))}`} className="text-amber-hi hover:text-hot">
                      {nameOf(a)}
                    </Link>
                  </span>
                ))}
                {h.agents.length > 3 && ` +${h.agents.length - 3}`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};

const WeekendPlate = ({ today, plate }: PlateProps & { plate: Extract<Plate, { kind: "none" }> }) => {
  const { anchor, anchorResolved, within } = plate;
  const tense = emptyTense(anchor);
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Chip tone="day">{today.plan.short}</Chip>
        <Chip tone="job">{PLATE_LABEL.none}</Chip>
        <Chip tone="dim">close-outs and callbacks only</Chip>
      </div>
      <Well className="mt-3 px-3 py-2.5 flex gap-3 items-start">
        <span className="font-condensed text-[11px] tracking-[.12em] uppercase text-amber shrink-0 mt-0.5">Monday</span>
        <p className="text-[13.5px] text-ink/90 leading-snug">
          {!anchor ? (
            <>No empty-next point yet — the Foreman needs a committed or delivered load. </>
          ) : !anchorResolved ? (
            <>Monday's pass waits on a coordinate for {placeLabel(anchor)} — the Foreman sharpens it as it geocodes. </>
          ) : (
            <>
              Monday's pass: {within} agent{within === 1 ? "" : "s"} within 150 mi of {placeLabel(anchor)}
              {tense === "now" ? " (empty now)" : tense === "unscheduled" ? " (the committed load has no delivery date yet)" : ` (empty ${emptyWhenLabel(anchor, "short")})`}.{" "}
            </>
          )}
          <ForemanDoor>Foreman</ForemanDoor>
        </p>
      </Well>
    </>
  );
};

const PlateBody = (props: PlateProps) => {
  switch (props.plate.kind) {
    case "capacity":
      return <CapacityPlate {...props} plate={props.plate} />;
    case "reactivation":
      return <ReactivationPlate {...props} plate={props.plate} />;
    case "nurture":
      return <NurturePlate {...props} plate={props.plate} />;
    case "five":
      return <FivePlate {...props} plate={props.plate} />;
    default:
      return <WeekendPlate {...props} plate={props.plate} />;
  }
};

// ---- the queue rows ----
const QueueRows = ({
  rows,
  loads,
  signer,
  onOpen,
  onCopied,
}: {
  rows: QueueRow[];
  loads: Load[];
  signer: Signer;
  onOpen: (agent: Agent, prefill: TouchPrefill) => void;
  onCopied: (what: string) => void;
}) => (
  <>
    {rows.map((r) => {
      const draft = r.section === "NOW" && r.load ? closeOutDraft(r.load, loads, signer) : null;
      return (
        <div key={r.key}>
          <AgentRow
            agent={r.agent}
            lead={SECTION_CHIP[r.section]}
            chip={r.touched ? { kind: "touched", label: `Touched ${r.touched.day}` } : null}
            context={r.touched ? `${r.context} · ${contactTypeLabel(r.touched.contact.type)} went out ${r.touched.day} — cap reached, back next week` : r.context}
            daysSince={undefined}
            right={r.touched ? { value: "—", caption: "this week" } : r.right}
            ghosted={r.touched != null}
            onOpen={() => onOpen(r.agent, r.prefill)}
          />
          {draft && (
            <div className="flex items-center gap-3 px-3.5 pb-2.5 -mt-0.5">
              <Well className="flex-1 min-w-0 px-3 py-1.5 font-condensed text-[12.5px] text-ink/85 truncate">{draft.subject}</Well>
              <CopyButton text={draftText(draft)} onCopied={() => onCopied(nameOf(r.agent))} />
            </div>
          )}
        </div>
      );
    })}
  </>
);

const CoolingRows = ({ rows, isAdmin, onOpen }: { rows: CoolingRow<Agent>[]; isAdmin: boolean; onOpen: (agent: Agent) => void }) => (
  <>
    {rows.map((r) => (
      <AgentRow
        key={r.agent.agent_id}
        agent={r.agent}
        lead={{ kind: "cool", label: "Cooling" }}
        chip={null}
        context={
          r.days == null
            ? `Tier ${r.tier} · never a two-way contact — flagged`
            : r.flagged
              ? `Tier ${r.tier} · last two-way contact ${shortDate(r.last)} · past ${r.threshold} days — flagged`
              : `Tier ${r.tier} · last two-way contact ${shortDate(r.last)} · flags ${shortDate(r.flagsOn)} if nothing changes`
        }
        daysSince={r.days}
        right={r.days == null ? { value: "never", caption: "two-way" } : { value: `${r.days}d`, caption: "two-way" }}
        onOpen={isAdmin ? () => onOpen(r.agent) : undefined}
      />
    ))}
  </>
);

const TodayView = () => {
  const { today, loads, signer, isAdmin, loadsReady, openAgent, notify, reload } = useRelationships();
  const mobile = useIsMobile();
  const [doneOpen, setDoneOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  if (!today) {
    return (
      <div className="ds2-board mt-4 px-4 py-6">
        <p className="font-condensed text-[14px] text-dim">
          {loadsReady ? "Building the day…" : "Today needs the loads — a close-out, a capacity list and a milestone all read them. Retry above and the queue fills in."}
        </p>
      </div>
    );
  }

  const open = (agent: Agent, prefill: TouchPrefill) => openAgent(agent.agent_id, { prefill });
  const copied = (what: string) => notify(`Copied · ${what}`);

  // One manual act, one contact. The toast's undo is the existing mislog delete.
  const logDirect = async (key: string, agent: Agent, input: Omit<CreateAgentContactInput, "agent_id">, label: string) => {
    setBusy(key);
    setError(null);
    let created: AgentContact;
    try {
      created = await createAgentContact({ agent_id: agent.agent_id, ...input });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't log the touch");
      setBusy(null);
      return;
    }
    notify(`Logged · ${nameOf(agent)} · ${label}`, {
      label: "undo",
      run: async () => {
        await deleteAgentContact(created.contact_id);
        await reload();
      },
    });
    await reload();
    setBusy(null);
  };

  // A skip is not a touch: the marker lands in an agent note, never a contact.
  const skipFlag = async (flag: NurtureFlag) => {
    const agent = nurtureAgent(flag);
    const key = `skip:${nurtureMarker(flag)}`;
    setBusy(key);
    setError(null);
    try {
      await createAgentNote(agent.agent_id, {
        note: `${skippedMarker(nurtureMarker(flag))} ${nurtureLabel(flag)} — skipped from Today`,
        created_by: initialsOf(signer),
      });
      notify(`Skipped · ${nameOf(agent)} · ${nurtureLabel(flag)}`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't record the skip");
    } finally {
      setBusy(null);
    }
  };

  const undoDone = async (c: AgentContact, who: string) => {
    setRowError(null);
    try {
      await deleteAgentContact(c.contact_id);
      notify(`Removed · ${who} · ${contactTypeLabel(c.type)}`);
      await reload();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Couldn't remove the touch");
    }
  };

  const queueEmpty = today.closeOuts.length + today.plateRows.length + today.callbacks.length + today.listRows.length === 0;
  // The head counts what the rows show: the flagged AND the ones being watched.
  const coolingRows = [...today.cooling.flagged, ...today.cooling.watch];

  return (
    <div className={`mt-4 ${mobile ? "pb-16" : ""}`}>
      {/* the plate — the day's one job */}
      <ForgedPlate chamfer className="px-4 py-4 sm:px-5">
        <PlateBody today={today} plate={today.plate} loads={loads} signer={signer} mobile={mobile} busy={busy} error={error} onOpen={open} onLog={logDirect} onSkip={skipFlag} onCopied={copied} />
      </ForgedPlate>

      {/* the queue */}
      <div className="ds2-board mt-3 overflow-hidden">
        <SectionHead right="the queue does the thinking — you do the talking">Today · {today.count} left</SectionHead>
        {queueEmpty ? (
          <p className="px-3.5 pb-4 pt-1 font-condensed text-[13.5px] text-dim">
            Nothing owed today — close-outs, the plate's rows and callbacks land here as they come.
          </p>
        ) : (
          <>
            <QueueRows rows={today.closeOuts} loads={loads} signer={signer} onOpen={open} onCopied={copied} />
            <QueueRows rows={today.plateRows} loads={loads} signer={signer} onOpen={open} onCopied={copied} />
            {today.plate.kind === "capacity" && today.plate.list.touched.length > 0 && (
              <p className="px-3.5 py-2.5 border-t border-hairline-lo font-condensed font-semibold text-[13px] text-ink">
                already touched this week · {today.plate.list.touched.length}{" "}
                <span className="text-dim font-medium">— {today.plate.list.touched.map((t) => nameOf(t.agent)).join(", ")} · one proactive touch each</span>
              </p>
            )}
            <QueueRows rows={today.callbacks} loads={loads} signer={signer} onOpen={open} onCopied={copied} />
            <QueueRows rows={today.listRows} loads={loads} signer={signer} onOpen={open} onCopied={copied} />
          </>
        )}
        {today.listMore > 0 && (
          <Link to="/relationships/calls" className="block px-3.5 py-3 border-t border-hairline-lo font-condensed font-semibold text-[13px] text-amber-hi hover:text-hot">
            Call list → {today.listMore} more
          </Link>
        )}
        {today.done.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setDoneOpen((v) => !v)}
              className="w-full text-left px-3.5 py-3 border-t border-hairline-lo font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint hover:text-ink"
            >
              Done today · {today.done.length} ✓ {doneOpen ? "· hide" : ""}
            </button>
            {doneOpen && (
              <div className="opacity-60">
                {today.done.map((d) => (
                  <div key={d.contact.contact_id} className="flex items-center gap-3 px-3.5 py-2 border-t border-hairline-lo font-condensed text-[13px]">
                    <span className="text-ink font-semibold truncate">{d.agent ? nameOf(d.agent) : "—"}</span>
                    <span className="text-dim truncate">
                      {d.label} · {d.contact.direction === "inbound" ? "they reached out" : d.contact.method} · {d.time}
                    </span>
                    <button type="button" onClick={() => void undoDone(d.contact, d.agent ? nameOf(d.agent) : "touch")} className="ml-auto text-amber-hi hover:text-hot shrink-0">
                      undo
                    </button>
                  </div>
                ))}
                <div className="px-3.5">
                  <ErrorLine>{rowError}</ErrorLine>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* cooling — the owner's monitoring, never a to-do */}
      <div className="ds2-board mt-3 overflow-hidden">
        <SectionHead right="monitoring — not a to-do">
          <span className="text-status-info-text">
            Cooling · for the owner · {today.cooling.flagged.length} flagged · {today.cooling.watch.length} watching
          </span>
        </SectionHead>
        {coolingRows.length === 0 ? (
          <p className="px-3.5 pb-4 pt-1 font-condensed text-[13.5px] text-dim">
            Nobody cooling — every tiered agent has had a two-way contact inside their threshold (Tier 1 · 21 days, Tier 2 · 42, Tier 3 · 90), and none flags in the next two weeks.
          </p>
        ) : (
          <>
            <CoolingRows rows={coolingRows} isAdmin={isAdmin} onOpen={(agent) => open(agent, { direction: "outbound", method: "call", type: "owner_personal" })} />
            <p className="flex items-center gap-2 px-3.5 py-2.5 border-t border-hairline-lo font-condensed text-[12px] text-faint">
              {isAdmin ? (
                <>tap a row to log your own thread — Owner personal, uncapped. A reached call or a load resets the clock; a voicemail or an email does not.</>
              ) : (
                <>
                  <Lock size={12} /> surfaced to the owner — a reached call or a load resets the clock; nothing here is owed by Dispatch.
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default TodayView;
