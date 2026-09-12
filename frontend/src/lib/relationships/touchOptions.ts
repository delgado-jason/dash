// The touch form's shared vocabulary — outcome, next-step and class tabs, the
// plain-English class descriptions, and the callback date chips — in one
// module so the agent sheet's LogTouchForm and the Call list's call screen
// offer the same words and land on the same dates. Pure; the clock is passed
// in so the chips can be tested against a frozen day.
import type { ContactMethod, ContactNextStep, ContactOutcome } from "@/services/agentContactsService";
import { localDayKey } from "./dayKeys";

export const OUTCOME_TABS: { value: ContactOutcome; label: string }[] = [
  { value: "reached", label: "Reached" },
  { value: "voicemail", label: "Voicemail" },
  { value: "no_answer", label: "No answer" },
  { value: "bad_number", label: "Bad number" },
];

export const outcomeLabel = (o: string | null | undefined): string | null =>
  OUTCOME_TABS.find((t) => t.value === o)?.label ?? null;

export const NEXT_TABS: { value: ContactNextStep; label: string }[] = [
  { value: "none", label: "Nothing owed" },
  { value: "call_back", label: "Call back" },
  { value: "on_their_list", label: "On their list" },
  { value: "send_capacity", label: "Send capacity" },
];

export type ClassPick = "direct" | "spot" | "unclear";
export const CLASS_TABS: { value: ClassPick; label: string }[] = [
  { value: "direct", label: "Direct" },
  { value: "spot", label: "Spot" },
  { value: "unclear", label: "Unclear" },
];
// The existing plain-English descriptions, kept verbatim.
export const CLASS_HELP =
  "Direct — their own shippers · Spot — works the board (the only answer that can park them) · Unclear — asked, couldn't tell";

// Callback date chips, in LOCAL calendar days — the SOP's Thursday is
// Brandie's Thursday. "Thu" is always the NEXT Thursday (never today).
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const nextThursday = (d: Date) => addDays(d, ((4 - d.getDay() + 7) % 7) || 7);
// "+1 mo" clamps to the end of the next month — Jan 31 → Feb 28 (Feb 29 in a
// leap year), never March 3 by day-overflow.
const addMonth = (d: Date) => {
  const lastOfNext = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), lastOfNext));
};

export interface DateChip {
  label: string;
  key: string; // 'YYYY-MM-DD'
}

export const dateChips = (now: Date): DateChip[] => [
  { label: "Thu", key: localDayKey(nextThursday(now)) },
  { label: "+1 wk", key: localDayKey(addDays(now, 7)) },
  { label: "+2 wk", key: localDayKey(addDays(now, 14)) },
  { label: "+1 mo", key: localDayKey(addMonth(now)) },
];

// ---- the cap's doors, by METHOD ----
// When the week's one proactive touch has already gone out, what the gate may
// offer depends on the CHANNEL, not on the reason:
//   a MESSAGE (text / email) may FOLD this reason into the message that
//     already went out — a PATCH; nothing new is created
//   a CALL is never folded — it carries an outcome (reached · voicemail · no
//     answer · bad number) that a fold would erase, and a call that happened
//     is a fact of the record
// Log anyway is never closed: a second touch is allowed with a reason in the
// note (the contact carries cap_override). Pure, so the door choice is tested
// here rather than through a rendered form.
export interface CapDoors {
  fold: boolean; // fold this reason into the week's first message
  logAnyway: boolean; // log it anyway, with a reason in the note
}

export const capDoors = (method: ContactMethod): CapDoors => ({ fold: method !== "call", logAnyway: true });
