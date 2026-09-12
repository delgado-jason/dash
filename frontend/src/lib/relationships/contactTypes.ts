// The touch-type registry — REL-01 v2.0's vocabulary, in the SOP's words.
//
// Every type carries its KIND, which is what the one-a-week cap and the
// cooling clock read:
//   proactive    counts against the cap (one per agent per week) — capacity
//                heads-up, milestone, holiday, reactivation, prospecting
//   operational  never capped — a load being worked is its own contact
//   inbound      they reached out; resets cooling, never capped
//   owner        the Owner's personal thread with the VIPs — uncapped, admin
//                only, visible in history so Dispatch knows the thread is his
// Retired v1 types stay valid for the rows that carry them and leave the
// pickers (the enum keeps them; see 073).

export type ContactType =
  | "capacity"
  | "milestone"
  | "holiday"
  | "reactivation"
  | "cold"
  | "close_out"
  | "load_in_progress"
  | "freight_bill"
  | "other"
  | "inbound_inquiry"
  | "owner_personal"
  | "check_in"
  | "appreciation"
  | "qualification";

export type ContactKind = "proactive" | "operational" | "inbound" | "owner";
export type ContactDirection = "outbound" | "inbound";

export interface ContactTypeDef {
  value: ContactType;
  label: string;
  kind: ContactKind;
  retired?: true;
}

export const CONTACT_TYPES: readonly ContactTypeDef[] = [
  { value: "capacity", label: "Capacity heads-up", kind: "proactive" },
  { value: "milestone", label: "Milestone", kind: "proactive" },
  { value: "holiday", label: "Holiday", kind: "proactive" },
  { value: "reactivation", label: "Reactivation", kind: "proactive" },
  { value: "cold", label: "Prospecting", kind: "proactive" },
  { value: "close_out", label: "Close-out", kind: "operational" },
  { value: "load_in_progress", label: "Load in progress", kind: "operational" },
  { value: "freight_bill", label: "Freight bill", kind: "operational" },
  // "Other" is operational when you reached out, inbound when they did —
  // contactKind() resolves it by direction.
  { value: "other", label: "Other", kind: "operational" },
  { value: "inbound_inquiry", label: "Load offer", kind: "inbound" },
  { value: "owner_personal", label: "Owner personal", kind: "owner" },
  { value: "check_in", label: "Check-in", kind: "proactive", retired: true },
  { value: "appreciation", label: "Appreciation", kind: "proactive", retired: true },
  { value: "qualification", label: "Qualification", kind: "proactive", retired: true },
];

const BY_VALUE = new Map(CONTACT_TYPES.map((t) => [t.value as string, t]));

export const contactTypeDef = (value: string): ContactTypeDef | undefined =>
  BY_VALUE.get(value);

// How a type reads on screen. Retired rows say so; an unknown value (a future
// enum member this build doesn't know) shows as itself rather than blank.
export const contactTypeLabel = (value: string): string => {
  const def = BY_VALUE.get(value);
  if (!def) return value;
  return def.retired ? `${def.label} (retired)` : def.label;
};

// The kind of one touch. Anything THEY initiated is inbound regardless of the
// type it was filed under; "other" from us is operational.
export const contactKind = (type: string, direction: ContactDirection): ContactKind => {
  if (direction === "inbound") return "inbound";
  return BY_VALUE.get(type)?.kind ?? "operational";
};

// Does this touch count against the one-a-week cap? Only what WE sent, and
// only the nurture/prospecting kinds. A voicemail still counts — the agent
// still heard from us this week.
export const isProactive = (c: { type: string; direction: ContactDirection }): boolean =>
  contactKind(c.type, c.direction) === "proactive";

// What the TYPE picker offers for a direction. Retired types never appear;
// the Owner's thread appears only for the admin.
export const pickerTypes = (
  direction: ContactDirection,
  opts: { admin: boolean },
): ContactTypeDef[] =>
  CONTACT_TYPES.filter((t) => {
    if (t.retired) return false;
    if (direction === "inbound") return t.kind === "inbound" || t.value === "other";
    if (t.kind === "inbound") return false;
    if (t.kind === "owner") return opts.admin;
    return true;
  });

// The form's default with no context (from the book): a tiered agent gets the
// primary nurture, a prospect who has hauled gets a reactivation, a stranger
// gets prospecting. Later PRs pass explicit prefills for Today / Call list.
export const defaultTouchType = (
  agent: { relationship_tier: number | null },
  deliveredCount: number,
): ContactType => {
  if (agent.relationship_tier != null) return "capacity";
  return deliveredCount > 0 ? "reactivation" : "cold";
};

// The registry as SegmentedTabs-ready options.
export const typeTabs = (defs: ContactTypeDef[]): { value: ContactType; label: string }[] =>
  defs.map((d) => ({ value: d.value, label: d.label }));
