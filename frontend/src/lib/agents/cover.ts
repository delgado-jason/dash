// The cover of an agent's file: the dates a record opens with, who books
// with them, the owner's call in words, and the chronology's lines.
//
// Nothing here grades anybody. The only verdict on a person in this module is
// the rating Jason set, read back in his own words (lib/agents/standing.ts);
// the rest is dates and counts.

import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import type { AgentRatingHistory } from "@/types/agentRatingHistory";
import type { TimelineEvent } from "@/types/timelineEvent";
import type { AgentContact } from "@/services/agentContactsService";
import { isDelivered } from "@/lib/metrics/status";
import { standingOf, standingLabel } from "./standing";
import { contactTypeLabel } from "@/lib/relationships/contactTypes";

const day = (iso: string | null | undefined): string | null =>
  iso ? String(iso).slice(0, 10) : null;

const isLoad = (l: Load): boolean => String(l.load_status) !== "tonu";

export interface CoverDates {
  onFileSince: string | null;
  firstLoad: string | null;
  lastWorked: string | null;
  lastSpokenTo: string | null;
}

export const coverDates = (
  agent: Pick<Agent, "created_at">,
  loads: Load[],
  touches: Pick<AgentContact, "contacted_at">[],
): CoverDates => {
  let firstLoad: string | null = null;
  let lastWorked: string | null = null;
  for (const l of loads) {
    if (!isLoad(l)) continue;
    const p = day(l.pickup_date);
    if (p && (firstLoad == null || p < firstLoad)) firstLoad = p;
    if (isDelivered(l)) {
      const d = day(l.delivery_date);
      if (d && (lastWorked == null || d > lastWorked)) lastWorked = d;
    }
  }
  let lastSpokenTo: string | null = null;
  for (const t of touches) {
    const d = day(t.contacted_at);
    if (d && (lastSpokenTo == null || d > lastSpokenTo)) lastSpokenTo = d;
  }
  return { onFileSince: day(agent.created_at), firstLoad, lastWorked, lastSpokenTo };
};

/** Whole days from `dayKey` (YYYY-MM-DD) to `now`, never negative. */
export const daysSince = (dayKey: string | null, now: Date): number | null => {
  if (!dayKey) return null;
  const then = Date.UTC(
    Number(dayKey.slice(0, 4)),
    Number(dayKey.slice(5, 7)) - 1,
    Number(dayKey.slice(8, 10)),
  );
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((today - then) / 86_400_000));
};

export interface Booker {
  name: string;
  n: number;
}

/** Who on your side books with this desk — by name, most loads first. */
export const bookedBy = (loads: Pick<Load, "booked_by_name" | "load_status">[]): Booker[] => {
  const m = new Map<string, number>();
  for (const l of loads) {
    if (String(l.load_status) === "tonu") continue;
    const name = l.booked_by_name?.trim();
    if (!name) continue;
    m.set(name, (m.get(name) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
};

export type CallTone = "positive" | "dim" | "aware" | "negative" | "faint";

export interface YourCall {
  parked: boolean;
  /** "4 · Good", "PARKED", "Unrated" */
  word: string;
  tone: CallTone;
  rating: number | null;
  /** the newest reason written with a rating change, if any */
  reason: string | null;
  /** the day the rating was last set, if its history says */
  setOn: string | null;
  parkReason: string | null;
}

const toneOf = (r: number | null): CallTone =>
  r === 5 || r === 4 ? "positive" : r === 3 ? "dim" : r === 2 ? "aware" : r === 1 ? "negative" : "faint";

/** The owner's call on a desk, in the rating scale's own words. */
export const yourCall = (
  agent: Pick<Agent, "rating" | "work_status" | "park_reason">,
  history: AgentRatingHistory[],
): YourCall => {
  const newest = history.reduce<AgentRatingHistory | null>(
    (m, h) => (!m || h.changed_at > m.changed_at ? h : m),
    null,
  );
  const rating = typeof agent.rating === "number" ? agent.rating : null;
  const reason = newest?.reason?.trim() ? newest.reason.trim() : null;
  const setOn = newest ? day(newest.changed_at) : null;
  if (standingOf(agent) === "parked")
    return {
      parked: true,
      word: "PARKED",
      tone: "negative",
      rating,
      reason,
      setOn,
      parkReason: agent.park_reason?.trim() || null,
    };
  const s = standingOf(agent);
  return {
    parked: false,
    word: s == null ? "Unrated" : standingLabel(s),
    tone: toneOf(rating),
    rating,
    reason,
    setOn,
    parkReason: null,
  };
};

export interface ChronoLine {
  key: string;
  day: string;
  /** "note · BD", "call · reached", "they emailed", "rating 3 → 4 · JD" */
  kind: string;
  text: string | null;
  inbound: boolean;
  /** set on a touch — a mis-log from a truck stop must be deletable */
  contactId: string | null;
}

const METHOD_PAST: Record<string, string> = { call: "called", email: "emailed", text: "texted" };
const OUTCOME_WORD: Record<string, string> = {
  reached: "reached",
  voicemail: "voicemail",
  no_answer: "no answer",
  bad_number: "bad number",
};

/** One line of the file's chronology from one timeline event. */
export const chronoLine = (e: TimelineEvent): ChronoLine => {
  if (e.type === "note")
    return {
      key: `note:${e.data.id}`,
      day: day(e.timestamp) ?? "",
      kind: `note · ${e.data.created_by}`,
      text: e.data.note,
      inbound: false,
      contactId: null,
    };
  if (e.type === "rating")
    return {
      key: `rating:${e.data.id}`,
      day: day(e.timestamp) ?? "",
      kind: `rating ${e.data.old_rating ?? "—"} → ${e.data.new_rating} · ${e.data.changed_by}`,
      text: e.data.reason?.trim() || null,
      inbound: false,
      contactId: null,
    };
  const t = e.data;
  const inbound = t.direction === "inbound";
  const method = String(t.method);
  let kind = inbound ? `they ${METHOD_PAST[method] ?? "reached out"}` : method;
  if (!inbound && method === "call" && t.outcome) kind += ` · ${OUTCOME_WORD[String(t.outcome)] ?? t.outcome}`;
  if (t.type && String(t.type) !== "check_in") kind += ` · ${contactTypeLabel(t.type).toLowerCase()}`;
  return {
    key: `touch:${t.contact_id}`,
    day: day(e.timestamp) ?? "",
    kind,
    text: t.note?.trim() || null,
    inbound,
    contactId: t.contact_id,
  };
};
