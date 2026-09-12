// The contact cap (REL-01 v2.0 §4): at most ONE proactive touch per agent per
// week, outside operational contact. A second reason in the same week folds
// into the first message. The week is the SOP's — Monday to Sunday, in local
// time — so the key is built from the local calendar, never toISOString.
import { isProactive } from "./contactTypes";
import { localDayKey } from "./dayKeys";

export interface CapContactLike {
  contact_id?: string;
  agent_id: string;
  contacted_at: string; // ISO
  direction: "outbound" | "inbound";
  type: string;
}

// The Monday that starts the local week containing `now`, as 'YYYY-MM-DD'.
export const weekKey = (now: Date): string => {
  const dow = (now.getDay() + 6) % 7; // Mon = 0 … Sun = 6
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
  return localDayKey(monday);
};

export const inSameWeek = (iso: string, now: Date): boolean => weekKey(new Date(iso)) === weekKey(now);

// This agent's proactive touches inside the current week, earliest first.
export const proactiveTouchesThisWeek = <C extends CapContactLike>(
  agentId: string,
  contacts: C[],
  now: Date,
): C[] =>
  contacts
    .filter((c) => c.agent_id === agentId && isProactive(c) && inSameWeek(c.contacted_at, now))
    .sort((a, b) => a.contacted_at.localeCompare(b.contacted_at));

export interface CapStatus<C> {
  count: number;
  first: C | null; // the message a second reason would fold into
  blocked: boolean; // a proactive touch already went out this week
}

export const capStatus = <C extends CapContactLike>(
  agentId: string,
  contacts: C[],
  now: Date,
): CapStatus<C> => {
  const week = proactiveTouchesThisWeek(agentId, contacts, now);
  return { count: week.length, first: week[0] ?? null, blocked: week.length > 0 };
};

// ---- the fold ----
// A second proactive reason in the same week rides on the message that
// already went out: the FIRST contact's combined_types grows by the new type
// and nothing new is created. Generic over the type vocabulary so the
// service's ContactType flows through without a cast.

export interface FoldTargetLike<T extends string = string> {
  type: T;
  combined_types?: T[] | null;
  note?: string | null;
}

// What the message carries after the fold — the reasons it already had plus
// this one, deduped, never repeating the message's own type.
export const foldTypes = <T extends string>(into: FoldTargetLike<T>, type: T): T[] =>
  Array.from(new Set([...(into.combined_types ?? []), type])).filter((t) => t !== into.type);

// Already in that message — as its own type or an earlier fold — so there is
// nothing to write.
export const alreadyCarries = <T extends string>(into: FoldTargetLike<T>, type: T): boolean =>
  type === into.type || (into.combined_types ?? []).includes(type);

// A fold's note is APPENDED to what the message already says, never written
// over it. null when neither side has anything.
export const mergeNote = (
  existing: string | null | undefined,
  added: string | null | undefined,
): string | null => {
  const e = existing?.trim() ?? "";
  const a = added?.trim() ?? "";
  if (!a) return e || null;
  if (!e) return a;
  return `${e} · ${a}`;
};

// The follow-up the form recorded alongside the folded reason.
export interface FoldFollowUp<N extends string = string> {
  note: string | null;
  next_step: N | null; // null or "none" = nothing owed
  next_step_at: string | null; // 'YYYY-MM-DD', already null unless a call-back
  footprint_captured: boolean;
}

export interface FoldPatch<T extends string, N extends string> {
  combined_types: T[];
  note?: string;
  next_step?: N;
  next_step_at?: string | null;
  footprint_captured?: true;
}

// The PATCH a fold sends: the grown combined_types, plus the form's follow-up
// merged in — a note appends, a real next step (anything but "none") replaces
// the message's, and a captured footprint is set. The defaults ("nothing
// owed", "not captured") are not carried, so a fold can never erase what the
// first message recorded.
export const foldPatch = <T extends string, N extends string>(
  into: FoldTargetLike<T>,
  type: T,
  f: FoldFollowUp<N>,
): FoldPatch<T, N> => {
  const patch: FoldPatch<T, N> = { combined_types: foldTypes(into, type) };
  const note = f.note?.trim();
  if (note) patch.note = mergeNote(into.note, note) ?? note;
  if (f.next_step && f.next_step !== "none") {
    patch.next_step = f.next_step;
    patch.next_step_at = f.next_step_at;
  }
  if (f.footprint_captured) patch.footprint_captured = true;
  return patch;
};
