import { DEFAULT_DETENTION_FREE_HOURS } from "@/lib/detention";
import { Fragment, useState, useMemo, useEffect, type ReactNode } from "react";
import { Link } from "react-router";

import { useAgent } from "@/hooks/useAgent";
import { useLoads } from "@/hooks/useLoads";
import { useCarrierName } from "@/hooks/useCarrierName";
import { useAgencies } from "@/hooks/useAgencies";
import { useRateTargets } from "@/hooks/useRateTargets";
import { createAgentNote } from "@/services/createAgentNoteService";
import { getAgentCoverage, type AgentCoverage } from "@/services/agentCoverageService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import {
  createAgentContact,
  getAgentContacts,
  deleteAgentContact,
  type AgentContact,
  type ContactMethod,
  type ContactOutcome,
} from "@/services/agentContactsService";
import { patchAgent } from "@/services/patchAgentService";

import CoverageEditor from "@/components/relationships/CoverageEditor";
import RatingForm from "@/components/RatingForm";
import { StopScorecard } from "@/components/StopScorecard";
import { IdentityFields, ContactFields } from "@/components/agents/AgentInfoFields";
import { CodeChip } from "@/components/relationships/primitives";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockSkeleton } from "@/components/ui/PageSkeletons";

import { agentStops, scoreStops, agentDetention, MIN_STOPS } from "@/lib/metrics/stopScore";
import {
  agentByType,
  bookOf,
  drivenMiles,
  worthASecondCall,
  type RateVerdict,
} from "@/lib/metrics/agentByType";
import { isDelivered, isNeverRevenue } from "@/lib/metrics/status";
import { fmtPerDay, perDayOver, perDayTone, perDayToneWord } from "@/lib/metrics/perDay";
import { perDayTextClass } from "@/components/lanes/rpmStyle";
import {
  getLoadCount,
  getGrossRevenue,
  getCancelledCount,
  buildTimeline,
} from "@/lib/metrics/agent";
import { loadRevenue } from "@/lib/metrics/loads";
import { otherCodes } from "@/lib/agencies/otherCodes";
import {
  draftFromAgent,
  validateDraft,
  buildAgentPatch,
  type AgentEditDraft,
} from "@/lib/agents/agentEdit";
import { haulSentence, countWord } from "@/lib/agents/haul";
import {
  coverDates,
  daysSince,
  bookedBy,
  yourCall,
  chronoLine,
  type CallTone,
} from "@/lib/agents/cover";
import { money, rpm as fmtRpm } from "@/lib/format";
import type { Load } from "@/types/load";

// ──────────────────────────────────────────────────────────────────────────
// THE FILE, NOT THE DASHBOARD. The C6 sheet asked for a dossier as a
// structure: one column, named parts in the order you would ask the
// questions, collapsing to the evidence. The first build gave it the headings
// and kept the furniture — a medallion, six panel cards, a board, a scrolling
// box, two forms above the record — and furniture is what the eye reads first.
//
// This page is written. The cover says who this is and when (on file since,
// first load, last worked, last spoken to, who books with them), then YOUR
// CALL — the rating in the scale's own words with the reason you gave, or
// PARKED with the reason — then IN SHORT, the standing line about the person.
// The five parts below are ruled headings over plain lines and plain tables.
// Nothing on this page grades a person but the rating; the money is a fact
// about the money. (Jason, Nov 15, 2026: the rating system only.)
// ──────────────────────────────────────────────────────────────────────────

// The chronology shows this many lines before "Show all" — recent state is
// what most visits need; deep history stays one click away.
const CHRONO_PREVIEW = 8;

const fmtDate = (d?: string | null) =>
  d
    ? new Date(String(d).slice(0, 10) + "T00:00:00Z").toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" },
      )
    : "—";

// "Oct 2" inside the current year, "Oct 2, 2025" outside it — a file's
// chronology reads by the day, and the year only when it changes something.
const fmtDay = (d: string, now: Date) =>
  new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...(d.slice(0, 4) !== String(now.getUTCFullYear()) ? { year: "numeric" } : {}),
  });

// The Scorer's words, so a desk's rate reads the same on the file as a load's
// does when it is scored. Colour carries the meaning and nothing else.
const DETAIL_VERDICT: Record<RateVerdict, { label: string; fg: string }> = {
  "below-cost": { label: "below cost", fg: "var(--color-status-negative-text)" },
  thin: { label: "thin — covers the truck", fg: "var(--color-amber-hi)" },
  profitable: { label: "profitable", fg: "var(--color-cat2)" },
  solid: { label: "solid", fg: "var(--color-cat2)" },
  prime: { label: "prime", fg: "var(--color-hot)" },
};

const CALL_TONE_CLASS: Record<CallTone, string> = {
  positive: "text-status-positive-text",
  dim: "text-dim",
  aware: "text-status-aware-text",
  negative: "text-status-negative-text",
  faint: "text-faint",
};

// The status of a load on the record, in words: "delivered · paid",
// "cancelled", "in transit". A chip is a dashboard's way of saying it.
const statusWords = (l: Load): { text: string; cls: string } => {
  const s = String(l.load_status).replace(/_/g, " ");
  if (isDelivered(l))
    return {
      text: l.payment_status ? `delivered · ${String(l.payment_status).replace(/_/g, " ")}` : "delivered",
      cls: "text-status-positive-text",
    };
  if (isNeverRevenue(l)) return { text: s, cls: "text-status-negative-text" };
  return { text: s, cls: "text-dim" };
};

// Each part of the file, headed by the question it answers. A heading that
// names the question rather than the contents is most of what makes this read
// as a file instead of a dashboard: "Activity" tells you what is in the box,
// "What was said" tells you why you would read it. Numbered and ruled so the
// page is five things in an order rather than a pile of panels.
const Part = ({ n, title, hint }: { n: number; title: string; hint?: string }) => (
  <div className="flex items-baseline gap-2.5 mt-7 mb-2 pt-3 border-t border-hairline">
    <span className="font-condensed text-[11px] text-faint tabular-nums">
      {String(n).padStart(2, "0")}
    </span>
    <h2 className="font-condensed font-semibold text-[15px] tracking-[.06em] uppercase text-ink">
      {title}
    </h2>
    {hint && <span className="text-[12px] text-faint">{hint}</span>}
  </div>
);

const QuietLink = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className="font-condensed text-[13px] text-amber-hi hover:underline underline-offset-2"
  >
    {children}
  </button>
);

const AgentDetailPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showRatingForm, setShowRatingForm] = useState(false);
  const carrierName = useCarrierName();
  const { agent, loads, notes, ratingHistory, isLoading, error } =
    useAgent(refreshKey);
  const { loads: allLoads } = useLoads(0);
  // The rungs come from the same rolling engine every other surface uses,
  // over the full load history the page already fetches.
  const overallTargets = useRateTargets(allLoads);
  const now = useMemo(() => new Date(), []);

  const [freeHours, setFreeHours] = useState(DEFAULT_DETENTION_FREE_HOURS);
  useEffect(() => {
    getSettlementSchedule()
      .then((s) => setFreeHours(s.detention_free_hours))
      .catch(() => {});
  }, []);

  // How this agent's freight behaves on the clock — dwell, on-time, detention.
  const timeScore = useMemo(
    () => scoreStops(agentStops(loads ?? [], freeHours)),
    [loads, freeHours],
  );
  // Detention claimed vs actually paid — does this agent's freight waste time?
  const det = useMemo(
    () => agentDetention(loads ?? [], freeHours),
    [loads, freeHours],
  );

  const agentId = agent?.agent_id;

  // IN SHORT = agents.notes — the permanent stuff (preferences, quirks, who
  // runs the yard). Dated events belong in the chronology below.
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // "edit the record" — name, agency, city/state and contact, edited in place
  // on the cover and in part 05. The rating keeps its own form.
  const [editingInfo, setEditingInfo] = useState(false);
  const [draft, setDraft] = useState<AgentEditDraft | null>(null);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const { agencies } = useAgencies(0);

  // The touches join the chronology — deletable, because a mis-log from a
  // truck stop must be fixable or the log rots.
  // HOOKS LIVE ABOVE THE EARLY RETURNS — inserting them after the loading
  // return crashed this page once (rendered-more-hooks), 2026-09-04.
  const [touches, setTouches] = useState<AgentContact[]>([]);
  useEffect(() => {
    if (!agentId) return;
    getAgentContacts()
      .then((all) => setTouches(all.filter((c) => c.agent_id === agentId)))
      .catch(() => {});
  }, [agentId, refreshKey]);
  const removeTouch = async (id: string) => {
    try {
      await deleteAgentContact(id);
      setTouches((prev) => prev.filter((c) => c.contact_id !== id));
    } catch {
      /* row stays — nothing changed server-side */
    }
  };

  // Footprint — the markets this agent says they cover. Same hooks-above-returns
  // rule as the touches above.
  const [coverage, setCoverage] = useState<AgentCoverage[]>([]);
  const [footprintOpen, setFootprintOpen] = useState(false);
  useEffect(() => {
    if (!agentId) return;
    getAgentCoverage()
      .then((all) => setCoverage(all.filter((c) => c.agent_id === agentId)))
      .catch(() => {});
  }, [agentId, refreshKey]);

  // A rate per book, each against its own rung. ABOVE THE GUARDS ON PURPOSE —
  // hooks must run in the same order on every render.
  const ladders = useMemo(
    () => ({
      standard: overallTargets.bookingLadder,
      specialized: overallTargets.specLadder,
    }),
    [overallTargets.bookingLadder, overallTargets.specLadder],
  );
  const byType = useMemo(() => agentByType(loads ?? [], ladders), [loads, ladders]);

  // ADD TO THE FILE — one door for the three writes: a note, a call, a rating
  // change. It sits at the foot of "what was said", below the record it adds
  // to. The call goes into agent_contacts, which the Foreman reads to work
  // out who has gone quiet; a call logged here is a desk that stops counting
  // as dormant.
  const [door, setDoor] = useState<null | "note" | "call">(null);
  const [noteText, setNoteText] = useState("");
  const [noteInitials, setNoteInitials] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [callMethod, setCallMethod] = useState<ContactMethod>("call");
  const [callOutcome, setCallOutcome] = useState<ContactOutcome>("reached");
  const [callNote, setCallNote] = useState("");
  const [callSaving, setCallSaving] = useState(false);
  const [callErr, setCallErr] = useState<string | null>(null);
  const [chronoExpanded, setChronoExpanded] = useState(false);

  const logCall = async () => {
    if (!agent) return;
    setCallErr(null);
    setCallSaving(true);
    try {
      await createAgentContact({
        agent_id: agent.agent_id,
        direction: "outbound",
        method: callMethod,
        // `check_in` is the honest default for a call made from here: it says
        // a touch happened without claiming a reason nobody typed.
        type: "check_in",
        outcome: callMethod === "call" ? callOutcome : null,
        note: callNote.trim() || null,
      });
      setCallNote("");
      setDoor(null);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setCallErr(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          "Couldn't log that — try again.",
      );
    } finally {
      setCallSaving(false);
    }
  };

  const addNote = async () => {
    if (!agent) return;
    setNoteError(null);
    if (!noteText.trim() || !noteInitials.trim()) {
      setNoteError("A note and your initials are required");
      return;
    }
    try {
      setSavingNote(true);
      await createAgentNote(agent.agent_id, {
        note: noteText.trim(),
        created_by: noteInitials.trim(),
      });
      setNoteText("");
      setNoteInitials("");
      setDoor(null);
      setRefreshKey((p) => p + 1);
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setSavingNote(false);
    }
  };

  if (isLoading)
    return (
      <div className="p-6 text-ink min-h-screen font-body">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-80 mb-6" />
        <BlockSkeleton className="h-56 mt-6" />
      </div>
    );
  if (error)
    return (
      <div className="p-6 text-ink min-h-screen font-body">
        <p className="text-destructive">{error}</p>
      </div>
    );
  if (!agent) return null;

  // ── THE COVER'S FACTS ────────────────────────────────────────────────────
  const fileLoads = loads ?? [];
  const dates = coverDates(agent, fileLoads, touches);
  const quietDays = daysSince(dates.lastSpokenTo, now);
  // Who on your side books with them. The loads list feed carries the
  // booker's name; the agent feed does not, so it is read from the book.
  const bookers = bookedBy((allLoads ?? []).filter((l) => l.agent_id === agent.agent_id));
  const call = yourCall(agent, ratingHistory);
  // A desk worked once that cleared its own book's rung — the same rule the
  // list marks with "second call".
  const secondCall =
    worthASecondCall(new Map([[agent.agent_id, fileLoads]]), ladders).length > 0;

  const grossRev = getGrossRevenue(loads);
  // What their freight pays per DAY of the truck — weighted Σgross ÷ Σdays
  // over the same delivered loads the rate reads (perDayOver keeps only the
  // delivered, dated ones). Graded against the ladder's daily target.
  const perDay = perDayOver(fileLoads).perDay;
  const perDayT = perDayTone(perDay, overallTargets.gross);

  // ── THE FILE IS AS LONG AS THE EVIDENCE ──────────────────────────────────
  // A desk with one load or none has nothing to lay out: the dock clock wants
  // three stamped stops it will never have, "every load together" is one row,
  // and a sentence computed from one load is a pattern claimed from a sample
  // of one. So the file collapses: the cover, one sentence that carries the
  // load, its rate and your rung, the chronology, the contact line — and it
  // says that nothing else is known. Forty-five of fifty-six desks on Jason's
  // book have exactly one delivered load; this is the shape most files take.
  //
  // The count is EVERY load, not just the delivered ones: a desk with one
  // delivered load and two in flight has live work on it.
  const thinFile = fileLoads.length <= 1;
  const onlyLoad = thinFile ? (fileLoads[0] ?? null) : null;

  // The best load they have ACTUALLY PAID OUT. Delivered only: "the one to
  // beat" is a claim about record, and a booked load can still cancel.
  const deliveredHere = fileLoads.filter(isDelivered);
  const bestLoad = deliveredHere.reduce<Load | null>(
    (b, l) => (!b || loadRevenue(l) > loadRevenue(b) ? l : b),
    null,
  );
  const haul = haulSentence(fileLoads);

  const lines = buildTimeline(notes, ratingHistory, touches).map(chronoLine);
  const visibleLines = chronoExpanded ? lines : lines.slice(0, CHRONO_PREVIEW);
  const agentLoads = [...fileLoads].sort((a, b) =>
    b.pickup_date.localeCompare(a.pickup_date),
  );

  const handleSuccess = () => {
    setRefreshKey((p) => p + 1);
    setShowRatingForm(false);
  };

  const patchDraft = (p: Partial<AgentEditDraft>) =>
    setDraft((d) => d && { ...d, ...p });

  const startEditingInfo = () => {
    setDraft(draftFromAgent(agent));
    setInfoError(null);
    setEditingInfo(true);
  };

  // PATCH returns the row without the joined agency columns, so on success the
  // page refetches (same as the in-short editor) rather than trusting the
  // response.
  const handleSaveInfo = async () => {
    if (!draft) return;
    const msg = validateDraft(draft);
    if (msg) {
      setInfoError(msg);
      return;
    }
    const payload = buildAgentPatch(agent, draft);
    if (!payload) {
      setEditingInfo(false);
      return;
    }
    setSavingInfo(true);
    try {
      await patchAgent(agent.agent_id, payload);
      setEditingInfo(false);
      setRefreshKey((p) => p + 1);
    } catch (e) {
      setInfoError(e instanceof Error ? e.message : "Couldn't save — try again.");
    } finally {
      setSavingInfo(false);
    }
  };

  const whereabouts = [agent.agent_city, agent.agent_state]
    .filter(Boolean)
    .join(", ");

  // The agency's OTHER desks — every code it has posted under except its own
  // (075 §5d). This agent's own posting code is in that set; it is folded in
  // here as well so a code just typed onto the person still shows before a
  // settlement feed appends it.
  const agency = agencies.find((a) => a.agency_id === agent.agency_id) ?? null;
  const deskCodes = otherCodes({
    agency_code: agent.agency_code,
    posting_codes: [...(agency?.posting_codes ?? []), agent.posting_code ?? ""],
  }).filter((c) => c !== agent.posting_code);

  // ── ONE LOAD, IN A SENTENCE ──────────────────────────────────────────────
  const oneLoadSentence = (l: Load): ReactNode => {
    const gross = loadRevenue(l);
    const driven = drivenMiles(l);
    const r = driven > 0 ? gross / driven : null;
    const rung = byType[bookOf(l)].minimum;
    const type = (l.load_type && l.load_type.trim()) || "standard flatbed";
    const when =
      l.delivery_date && l.delivery_date !== l.pickup_date
        ? `picked up ${fmtDate(l.pickup_date)}, delivered ${fmtDate(l.delivery_date)}`
        : `picked up and delivered ${fmtDate(l.pickup_date)}`;
    const pay =
      String(l.payment_status) === "paid"
        ? "Paid."
        : l.payment_status
          ? `Payment ${String(l.payment_status).replace(/_/g, " ")}.`
          : "";
    const dock =
      timeScore.timedStops === 0
        ? "No dock stamps"
        : `${timeScore.timedStops} stamped stop${timeScore.timedStops === 1 ? "" : "s"}`;
    const foot =
      coverage.length === 0
        ? "no footprint captured"
        : `${coverage.length} market${coverage.length === 1 ? "" : "s"} claimed`;
    const above = r != null && rung != null ? r >= rung : null;
    return (
      <>
        One load: <b className="text-ink">{money(gross)}</b>
        {l.shipper_name?.trim() ? ` for ${l.shipper_name.trim()}` : ""}, {l.origin_city},{" "}
        {l.origin_state} → {l.destination_city}, {l.destination_state}, {when} —{" "}
        {r == null ? (
          "no miles logged"
        ) : (
          <>
            <b
              className={
                above == null
                  ? "text-ink"
                  : above
                    ? "text-status-positive-text"
                    : "text-status-negative-text"
              }
            >
              {fmtRpm(r)} a driven mile
            </b>{" "}
            on {type}
            {rung != null ? `, ${above ? "above" : "under"} your ${fmtRpm(rung)} rung` : ""}
          </>
        )}
        . {pay} {dock}, {foot}.
      </>
    );
  };

  // ── THE CHRONOLOGY AND ITS DOOR ──────────────────────────────────────────
  const chronology = (
    <>
      {lines.length === 0 ? (
        <p className="font-condensed text-[13.5px] text-faint italic mt-2">
          Nothing written down yet.
        </p>
      ) : (
        <div className="grid grid-cols-[56px_minmax(96px,150px)_1fr_auto] gap-x-3 gap-y-1.5 font-condensed text-[13.5px] mt-2 leading-[1.5]">
          {visibleLines.map((ln) => (
            <Fragment key={ln.key}>
              <span className="text-faint whitespace-nowrap">{ln.day ? fmtDay(ln.day, now) : "—"}</span>
              <span className={ln.inbound ? "text-status-positive-text" : "text-dim"}>{ln.kind}</span>
              <span className={ln.text ? "text-ink whitespace-pre-wrap" : "text-faint"}>
                {ln.text ?? "—"}
              </span>
              <span className="text-right">
                {ln.contactId && (
                  <button
                    type="button"
                    className="text-faint hover:text-destructive text-xs"
                    title="delete this touch — mis-logs happen; the Foreman recomputes"
                    onClick={() => void removeTouch(ln.contactId as string)}
                  >
                    ✕
                  </button>
                )}
              </span>
            </Fragment>
          ))}
        </div>
      )}
      {lines.length > CHRONO_PREVIEW && (
        <button
          type="button"
          className="font-condensed text-[13px] text-dim hover:text-ink mt-2 underline underline-offset-2"
          onClick={() => setChronoExpanded((p) => !p)}
        >
          {chronoExpanded ? "Show less" : `Show all ${lines.length}`}
        </button>
      )}

      <div className="mt-3">
        {door == null ? (
          <p className="font-condensed text-[13px]">
            <QuietLink onClick={() => setDoor("note")}>› Add to the file</QuietLink>
            <span className="text-faint"> — a note · a call · a rating change</span>
          </p>
        ) : (
          <div className="rounded-[9px] bg-well p-3 max-w-[640px]">
            <div className="flex flex-wrap items-center gap-1.5 font-condensed text-[12.5px] font-semibold">
              {(["note", "call"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDoor(k)}
                  className={`rounded-full px-2.5 py-1 border ${
                    door === k ? "bg-amber border-amber text-canvas" : "border-hairline text-dim hover:text-ink"
                  }`}
                >
                  {k === "note" ? "A note" : "A call"}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setDoor(null);
                  setShowRatingForm(true);
                }}
                className="rounded-full px-2.5 py-1 border border-hairline text-dim hover:text-ink"
              >
                A rating change
              </button>
              <button
                type="button"
                className="ml-auto text-dim hover:text-ink font-normal"
                onClick={() => setDoor(null)}
              >
                cancel
              </button>
            </div>

            {door === "note" && (
              <div className="mt-2.5">
                <textarea
                  className="bg-canvas border border-hairline rounded-[7px] px-2.5 py-2 text-sm w-full text-ink placeholder:text-faint"
                  placeholder="What happened, in a line or two"
                  rows={2}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <div className="flex items-center gap-2 mt-2">
                  <input
                    className="bg-canvas border border-hairline rounded-[7px] px-2.5 py-1.5 text-sm w-24 text-ink placeholder:text-faint"
                    placeholder="Initials"
                    maxLength={5}
                    value={noteInitials}
                    onChange={(e) => setNoteInitials(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => void addNote()}
                    disabled={savingNote}
                    className="ml-auto h-8 px-3.5 rounded-[9px] bg-amber text-steel text-sm font-condensed font-semibold disabled:opacity-50"
                  >
                    {savingNote ? "Saving…" : "Add the note"}
                  </button>
                </div>
                {noteError && <p className="text-destructive text-xs mt-1.5">{noteError}</p>}
              </div>
            )}

            {door === "call" && (
              <div className="mt-2.5">
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    value={callMethod}
                    onChange={(e) => setCallMethod(e.target.value as ContactMethod)}
                    className="bg-canvas border border-hairline rounded-[7px] px-2 py-1.5 text-sm text-ink"
                  >
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="text">Text</option>
                  </select>
                  {/* An outcome only means something for a call — an email has
                      no voicemail. */}
                  {callMethod === "call" && (
                    <select
                      value={callOutcome}
                      onChange={(e) => setCallOutcome(e.target.value as ContactOutcome)}
                      className="bg-canvas border border-hairline rounded-[7px] px-2 py-1.5 text-sm text-ink"
                    >
                      <option value="reached">Reached them</option>
                      <option value="voicemail">Voicemail</option>
                      <option value="no_answer">No answer</option>
                      <option value="bad_number">Bad number</option>
                    </select>
                  )}
                </div>
                <textarea
                  className="bg-canvas border border-hairline rounded-[7px] px-2.5 py-2 text-sm w-full text-ink placeholder:text-faint mt-2"
                  placeholder="What was said? (optional)"
                  rows={2}
                  value={callNote}
                  onChange={(e) => setCallNote(e.target.value)}
                />
                {callErr && <p className="text-destructive text-xs mt-1.5">{callErr}</p>}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => void logCall()}
                    disabled={callSaving}
                    className="h-8 px-3.5 rounded-[9px] bg-amber text-steel text-sm font-condensed font-semibold disabled:opacity-60"
                  >
                    {callSaving ? "Logging…" : "Log it"}
                  </button>
                  <span className="text-[11.5px] text-faint">
                    Dated now. The Foreman reads this to work out who has gone quiet.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  // ── HOW TO REACH THEM, ON ONE LINE ───────────────────────────────────────
  const contactLine = editingInfo && draft ? (
    <ContactFields draft={draft} onChange={patchDraft} />
  ) : (
    <p className="font-condensed text-[13.5px] text-dim leading-[1.8] break-words">
      phone <b className="text-ink">{agent.phone || "none on file"}</b>
      {" · "}email <b className="text-ink">{agent.email || "none on file"}</b>
      {" · "}prefers{" "}
      <b className="text-ink capitalize">{agent.preferred_contact || "not asked"}</b>
      {" · "}best time <b className="text-ink">{agent.best_time_to_call || "not asked"}</b>{" "}
      <QuietLink onClick={startEditingInfo}>› edit</QuietLink>
    </p>
  );

  const n = fileLoads.length;
  const happenedHint = timeScore.hasData
    ? "time on the dock, and every load together"
    : timeScore.timedStops === 0
      ? `${countWord(n)} loads together · no dock stamps on any of them, so no clock`
      : `${countWord(n)} loads together · ${timeScore.timedStops} stamped stop${timeScore.timedStops === 1 ? "" : "s"}, the clock needs ${MIN_STOPS}`;

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-12 pt-5">
      {showRatingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowRatingForm(false)}
          />
          <div className="relative w-full max-w-[450px] mx-4 max-h-[90vh] bg-panel text-ink overflow-y-auto shadow-xl rounded-xl p-4 sm:p-6 border border-hairline">
            <RatingForm
              agent={agent}
              onSuccess={handleSuccess}
              onClose={() => setShowRatingForm(false)}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 font-condensed text-[12.5px]">
        <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
        <Link to="/agents" className="text-dim hover:text-ink">← Agents</Link>
        <span className="flex-1" />
        {editingInfo ? (
          <>
            <button
              type="button"
              onClick={() => void handleSaveInfo()}
              disabled={savingInfo}
              className="h-8 px-3.5 rounded-[9px] bg-amber text-steel text-sm font-semibold disabled:opacity-50"
            >
              {savingInfo ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              className="text-dim hover:text-ink"
              onClick={() => setEditingInfo(false)}
            >
              cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={startEditingInfo} className="text-dim hover:text-ink">
              edit the record
            </button>
            <span className="text-faint">·</span>
            <button
              type="button"
              onClick={() => setShowRatingForm(true)}
              className="text-dim hover:text-ink"
            >
              change the rating
            </button>
          </>
        )}
      </div>
      {infoError && <p className="text-status-negative-text text-xs mt-2">{infoError}</p>}

      {/* ── THE COVER ─────────────────────────────────────────────────── */}
      <div className="max-w-[780px] mt-4">
        {editingInfo && draft ? (
          <IdentityFields draft={draft} onChange={patchDraft} agencies={agencies} />
        ) : (
          <>
            <h1 className="font-display text-[32px] tracking-[.05em] leading-none">
              {agent.first_name} {agent.last_name}
            </h1>
            {/* The agency reads as a name plus its code, the person's own
                posting code when they have one, and every other code the
                agency has posted under. No name on file — the code says it. */}
            <p className="font-condensed text-[14px] text-dim mt-2 flex items-center gap-x-2 gap-y-1 flex-wrap">
              {agent.agency_name && <span className="text-ink">{agent.agency_name}</span>}
              {agent.agency_code || (!agent.posting_code && deskCodes.length === 0) ? (
                <CodeChip code={agent.agency_code} kind="agency" />
              ) : null}
              {agent.posting_code && (
                <span className="flex items-center gap-1.5">
                  <span className="text-faint">posts as</span>
                  <CodeChip code={agent.posting_code} kind="posting" />
                </span>
              )}
              {deskCodes.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="text-faint">also</span>
                  {deskCodes.map((code) => (
                    <CodeChip key={code} code={code} kind="posting" />
                  ))}
                </span>
              )}
              {whereabouts ? <span>· {whereabouts}</span> : null}
              {carrierName ? <span>· {carrierName} agent</span> : null}
              {secondCall && (
                <span
                  className="font-semibold tracking-[.06em] uppercase text-[12px]"
                  style={{ color: "var(--color-cat2)" }}
                >
                  worth a second call
                </span>
              )}
            </p>
          </>
        )}

        <p className="font-condensed text-[13.5px] text-dim mt-2 leading-[1.7]">
          on file since <b className="text-ink">{fmtDate(dates.onFileSince)}</b>
          {dates.firstLoad && (
            <>
              {" · "}
              {thinFile && onlyLoad ? "one load" : "first load"}{" "}
              <b className="text-ink">{fmtDate(dates.firstLoad)}</b>
            </>
          )}
          {dates.lastWorked && (!thinFile || dates.lastWorked !== dates.firstLoad) && (
            <>
              {" · "}last worked <b className="text-ink">{fmtDate(dates.lastWorked)}</b>
            </>
          )}
          {dates.lastSpokenTo ? (
            <>
              {" · "}last spoken to <b className="text-ink">{fmtDate(dates.lastSpokenTo)}</b>
              {quietDays != null && (
                <span className="text-faint">
                  {" "}· {quietDays === 0 ? "today" : `${quietDays} day${quietDays === 1 ? "" : "s"} ago`}
                </span>
              )}
            </>
          ) : (
            <>
              {" · "}
              <span className="text-faint">no call logged yet</span>
            </>
          )}
          {bookers.length > 0 && (
            <>
              {" · "}booked by{" "}
              <b className="text-ink">{bookers.map((b) => `${b.name} ×${b.n}`).join(" · ")}</b>
            </>
          )}
        </p>

        <div className="grid grid-cols-[92px_1fr] gap-x-3.5 gap-y-2 mt-3.5 pt-3 border-t border-hairline font-condensed text-[13.5px]">
          <span className="ds2-label pt-1">Your call</span>
          {call.parked ? (
            <p className="text-dim" data-testid="your-call">
              <b className="text-status-negative-text text-[15px] tracking-[.06em]">PARKED</b>
              {" · "}
              {call.parkReason ?? "no reason written"}
              {call.rating != null && <span className="text-faint"> · was {call.rating} / 5</span>}{" "}
              <QuietLink onClick={() => setShowRatingForm(true)}>› change it</QuietLink>
            </p>
          ) : (
            <p className="text-dim" data-testid="your-call">
              <b className={`${CALL_TONE_CLASS[call.tone]} text-[15px] tracking-[.06em] uppercase`}>
                {call.word}
              </b>
              {call.setOn && <> · set {fmtDate(call.setOn)}</>}
              {" · "}
              {call.reason ?? <span className="text-faint">no reason written</span>}{" "}
              <QuietLink onClick={() => setShowRatingForm(true)}>
                › {call.reason ? "change it" : "write one"}
              </QuietLink>
            </p>
          )}

          <span className="ds2-label pt-1">In short</span>
          <div>
            {editingNotes ? (
              <>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={3}
                  placeholder="The permanent line about them — preferences, quirks, who runs the yard. Dated events go in the chronology."
                  className="w-full bg-well border border-hairline rounded-[7px] px-2.5 py-2 text-sm text-ink placeholder:text-faint resize-y"
                />
                <div className="flex gap-2 mt-1.5 items-center">
                  <button
                    type="button"
                    className="bg-amber text-steel px-3 py-1 rounded text-xs font-semibold disabled:opacity-50"
                    disabled={savingNotes}
                    onClick={async () => {
                      setSavingNotes(true);
                      try {
                        await patchAgent(agent.agent_id, { notes: notesDraft.trim() || null });
                        setEditingNotes(false);
                        setRefreshKey((p) => p + 1);
                      } finally {
                        setSavingNotes(false);
                      }
                    }}
                  >
                    {savingNotes ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-dim hover:text-ink"
                    onClick={() => setEditingNotes(false)}
                  >
                    cancel
                  </button>
                </div>
              </>
            ) : agent.notes ? (
              <p className="text-ink whitespace-pre-wrap leading-snug">
                {agent.notes}{" "}
                <QuietLink
                  onClick={() => {
                    setNotesDraft(agent.notes ?? "");
                    setEditingNotes(true);
                  }}
                >
                  › edit
                </QuietLink>
              </p>
            ) : (
              <p className="text-faint italic">
                nothing written yet{" "}
                <QuietLink
                  onClick={() => {
                    setNotesDraft("");
                    setEditingNotes(true);
                  }}
                >
                  › write a line
                </QuietLink>
              </p>
            )}
          </div>
        </div>
      </div>

      {thinFile ? (
        /* ── THE SHORT FILE ──────────────────────────────────────────── */
        <div className="max-w-[780px]">
          <p className="text-[14.5px] leading-[1.6] mt-5 pt-3 border-t border-hairline text-dim">
            {onlyLoad == null ? (
              "No loads together yet."
            ) : isDelivered(onlyLoad) ? (
              oneLoadSentence(onlyLoad)
            ) : (
              <>
                One load on the board with them —{" "}
                <Link
                  to={`/loads/${onlyLoad.load_id}`}
                  className="text-amber-light hover:underline font-medium"
                >
                  {onlyLoad.load_number}
                </Link>
                , {String(onlyLoad.load_status).replace(/_/g, " ")}. Nothing delivered yet.
              </>
            )}
          </p>
          {onlyLoad && isDelivered(onlyLoad) && (
            <p className="font-condensed text-[13px] text-faint mt-1">
              <Link to={`/loads/${onlyLoad.load_id}`} className="text-amber-light hover:underline">
                {onlyLoad.load_number}
              </Link>
            </p>
          )}
          {coverage.length > 0 && (
            <p className="font-condensed text-[13.5px] text-dim mt-2">
              where they say they cover{" "}
              <b className="text-ink">
                {coverage.map((c) => `${c.city}, ${c.state}${c.source === "confirmed" ? "" : " (claimed)"}`).join(" · ")}
              </b>
            </p>
          )}

          <div className="mt-5 pt-3 border-t border-hairline">{chronology}</div>

          <div className="mt-5 pt-3 border-t border-hairline">{contactLine}</div>
          <p className="font-condensed text-[12.5px] text-faint italic mt-4">
            Nothing else is known, so nothing else is drawn.
          </p>
        </div>
      ) : (
        <>
          {/* ── 01 DO THEY PAY ──────────────────────────────────────────
              A row per book against its own rung, then the lifetime money on
              one line that names its own window. The same figures as the
              board that used to hold them; the board is gone. */}
          <div className="max-w-[780px]">
            <Part n={1} title="Do they pay" hint="each book against its own rung" />
            <table className="w-full font-condensed text-[13.5px] tabular-nums">
              <thead>
                <tr className="text-faint text-[11px] tracking-[.1em] uppercase">
                  <th className="text-left font-semibold pr-3 pb-1.5">Freight</th>
                  <th className="text-right font-semibold px-3 pb-1.5">Loads</th>
                  <th className="text-right font-semibold px-3 pb-1.5 whitespace-nowrap">Their rate</th>
                  <th className="text-right font-semibold px-3 pb-1.5 whitespace-nowrap">Your rung</th>
                  <th className="text-left font-semibold pl-3 pb-1.5">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {(["standard", "specialized"] as const).map((book) => {
                  const r = byType[book];
                  const v = r.verdict ? DETAIL_VERDICT[r.verdict] : null;
                  return (
                    <tr key={book} className="border-t ds2-cell-rule">
                      <td className="pr-3 py-2 text-dim capitalize">{book}</td>
                      <td className="px-3 py-2 text-right text-dim">{r.loads || "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold" style={{ color: v?.fg }}>
                        {r.rpm == null ? <span className="text-faint font-normal">—</span> : `${fmtRpm(r.rpm)} a driven mile`}
                      </td>
                      <td className="px-3 py-2 text-right text-faint">
                        {r.minimum == null ? "—" : `${fmtRpm(r.minimum)} min`}
                      </td>
                      <td className="pl-3 py-2" style={{ color: v?.fg }}>
                        {v ? (
                          v.label
                        ) : r.loads === 1 ? (
                          /* One load is a fact about one load. */
                          <span className="text-faint">one load — no verdict yet</span>
                        ) : r.loads === 0 ? (
                          <span className="text-faint">never sent you {book} freight</span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="font-condensed text-[13px] text-dim mt-2 pt-2 border-t ds2-cell-rule">
              <b className="text-ink">{getLoadCount(loads)}</b> delivered ·{" "}
              <b className="text-ink">{grossRev == null ? "—" : money(grossRev)}</b> gross ·{" "}
              <b className="text-ink">{fmtPerDay(perDay)}</b> a day of truck
              {perDayToneWord(perDayT) ? (
                <span className={perDayT ? perDayTextClass(perDayT) : undefined}>
                  {" "}
                  ({perDayToneWord(perDayT)})
                </span>
              ) : null}
              {getCancelledCount(loads) > 0 && (
                <> · <b className="text-status-negative-text">{getCancelledCount(loads)} cancelled</b></>
              )}
              <span className="text-faint"> · lifetime</span>
            </p>

            {/* ── 02 WHAT THEY HAUL ───────────────────────────────────── */}
            <Part n={2} title="What they haul" />
            {haul && <p className="text-[14.5px] leading-[1.55] text-ink mt-1">{haul}</p>}
            {bestLoad && (
              <p className="font-condensed text-[13.5px] text-dim mt-2">
                best load together{" "}
                <Link
                  to={`/loads/${bestLoad.load_id}`}
                  className="text-ink font-semibold tabular-nums hover:text-amber-light hover:underline"
                >
                  {money(loadRevenue(bestLoad))} · {bestLoad.origin_city}, {bestLoad.origin_state} →{" "}
                  {bestLoad.destination_city}, {bestLoad.destination_state}
                </Link>
                {" · "}
                {fmtDate(bestLoad.pickup_date)}
                {drivenMiles(bestLoad) > 0 && (
                  <> · {fmtRpm(loadRevenue(bestLoad) / drivenMiles(bestLoad))} a driven mile</>
                )}
                <span className="text-faint"> · the one to beat</span>
              </p>
            )}
            <p className="font-condensed text-[13.5px] text-dim mt-1">
              where they say they cover{" "}
              {coverage.length === 0 ? (
                <span className="text-faint italic">nothing captured</span>
              ) : (
                <b className="text-ink">
                  {coverage.map((c) => `${c.city}, ${c.state}${c.source === "confirmed" ? "" : " (claimed)"}`).join(" · ")}
                </b>
              )}{" "}
              <QuietLink onClick={() => setFootprintOpen((v) => !v)}>
                {footprintOpen ? "› done" : coverage.length === 0 ? "› add a market" : "› edit"}
              </QuietLink>
            </p>
            {footprintOpen && (
              <div className="mt-2 rounded-[9px] bg-well p-3 max-w-[640px]">
                <p className="text-[12.5px] text-faint mb-2 leading-snug">
                  A claimed market turns confirmed once a load comes out of that city. Pick the
                  city from the list — a typed city has no coordinate, so the Foreman can't place it.
                </p>
                <CoverageEditor
                  agentId={agent.agent_id}
                  rows={coverage}
                  onChanged={() => setRefreshKey((p) => p + 1)}
                  emptyText="No markets captured yet"
                />
              </div>
            )}
          </div>

          {/* ── 03 WHAT HAPPENED ────────────────────────────────────────
              Every load as one plain list, newest first, no inner scroll —
              the one part of the file allowed the full column. The dock
              clock is drawn only once it has three stamped stops to read;
              on Jason's book tonight no load carries any. */}
          <Part n={3} title="What happened" hint={happenedHint} />
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full font-condensed text-[13.5px] tabular-nums min-w-[760px]">
              <thead>
                <tr className="text-faint text-[11px] tracking-[.1em] uppercase">
                  <th className="text-left font-semibold pr-3 pb-1.5">Day</th>
                  <th className="text-left font-semibold px-3 pb-1.5">Load</th>
                  <th className="text-left font-semibold px-3 pb-1.5">Lane</th>
                  <th className="text-left font-semibold px-3 pb-1.5">Type</th>
                  <th className="text-right font-semibold px-3 pb-1.5">Driven</th>
                  <th className="text-right font-semibold px-3 pb-1.5">Gross</th>
                  <th className="text-right font-semibold px-3 pb-1.5">$/mi</th>
                  <th className="text-left font-semibold px-3 pb-1.5">Status</th>
                  <th className="text-left font-semibold pl-3 pb-1.5 whitespace-nowrap">Booked by</th>
                </tr>
              </thead>
              <tbody>
                {agentLoads.map((load) => {
                  const driven = drivenMiles(load);
                  const gross = loadRevenue(load);
                  const earns = !isNeverRevenue(load) && driven > 0;
                  const st = statusWords(load);
                  const booker = (allLoads ?? []).find((l) => l.load_id === load.load_id)?.booked_by_name;
                  return (
                    <tr key={load.load_id} className="border-t ds2-cell-rule">
                      <td className="pr-3 py-2 text-dim whitespace-nowrap">{fmtDay(load.pickup_date, now)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link
                          to={`/loads/${load.load_id}`}
                          className="text-amber-light hover:underline font-semibold"
                        >
                          {load.load_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-ink">
                        {load.origin_city}, {load.origin_state} <span className="text-faint">→</span>{" "}
                        {load.destination_city}, {load.destination_state}
                      </td>
                      <td className="px-3 py-2 text-dim whitespace-nowrap">
                        {(load.load_type && load.load_type.trim()) || "standard flatbed"}
                      </td>
                      <td className="px-3 py-2 text-right text-dim whitespace-nowrap">
                        {driven > 0 ? driven.toLocaleString("en-US") : "—"}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap font-semibold text-ink">
                        {money(gross)}
                      </td>
                      <td className="px-3 py-2 text-right text-dim whitespace-nowrap">
                        {earns ? fmtRpm(gross / driven) : "—"}
                      </td>
                      <td className={`px-3 py-2 whitespace-nowrap ${st.cls}`}>{st.text}</td>
                      <td className="pl-3 py-2 text-dim whitespace-nowrap">{booker ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {det.claimable > 0 && (
            <p className="font-condensed text-[13.5px] text-dim mt-2">
              <b className="text-ink">{det.paid} of {det.claimable}</b> detention loads collected
              {det.claimable - det.paid > 0 && (
                <span className="text-status-negative-text">
                  {" · "}
                  {det.claimable - det.paid} held you up with no detention paid
                </span>
              )}
            </p>
          )}
          {timeScore.hasData && (
            <div className="max-w-[780px] mt-4">
              <StopScorecard
                score={timeScore}
                countLabel="Loads"
                countValue={getLoadCount(loads)}
              />
            </div>
          )}

          {/* ── 04 WHAT WAS SAID ────────────────────────────────────── */}
          <div className="max-w-[780px]">
            <Part
              n={4}
              title="What was said"
              hint={lines.length > 0 ? `${lines.length} entr${lines.length === 1 ? "y" : "ies"}, newest first` : undefined}
            />
            {chronology}

            {/* ── 05 HOW TO REACH THEM ──────────────────────────────── */}
            <Part n={5} title="How to reach them" />
            {contactLine}
          </div>
        </>
      )}
      </div>
    </div>
  );
};

export default AgentDetailPage;
