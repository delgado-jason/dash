// The relationship system's drafts — REL-01 v2.0 §7's scripts, filled from
// live data. Short on purpose: an agent reads forty emails before lunch.
// dash DRAFTS and LOGS; the person on shift copies, sends from their own
// email or phone, and logs it. Every draft is signed by whoever is logged in
// (their display name from the users table) — never a name typed in here;
// with no name on file the SOP's own [Name] bracket stays, to be filled in.
import type { Load } from "@/types/load";
import { emptyNextWhen, emptyTense, emptyWhenLabel, placeLabel, roundMiles, type EmptyNext } from "./relationships/capacityList";
import { ordinal, type MilestoneKind } from "./relationships/milestones";
import { HOLIDAY_LABEL, type HolidayKind } from "./relationships/holidays";

export interface Draft {
  subject: string;
  body: string;
}

// The logged-in user's display name; null when none is on file.
export type Signer = string | null;

// The business name as the §7 scripts spell it.
export const COMPANY = "Delgado Trucking";

export const signerWord = (signer: Signer): string => signer?.trim() || "[Name]";
const signOff = (signer: Signer): string => `\n\n— ${signerWord(signer)} · ${COMPANY}`;

interface AgentName {
  first_name: string;
}

// ---- ① capacity heads-up, within 150 mi ----
// "Morning [Agent] — [Name] at Delgado Trucking. We'll be empty [city, ST]
// [day, time], within about [X] miles of your freight. Open to anything
// working out of there. Anything I can look at?"
// The [day, time] comes from the empty-next point itself (emptyWhenLabel),
// and the TENSE from emptyTense — present when the truck already sits empty,
// future for a committed load, "after our next drop" when that load has no
// delivery date yet (never "now": the truck is loaded). `fold` is a second
// reason riding on the same message (the cap's combined message): a
// milestone or holiday sentence.
const emptyLine = (e: EmptyNext): string => {
  const place = placeLabel(e);
  switch (emptyTense(e)) {
    case "now":
      return `We're empty ${place} now`;
    case "unscheduled":
      return `We'll be empty ${place} after our next drop`;
    default:
      return `We'll be empty ${place} ${emptyWhenLabel(e, "long")}`;
  }
};

export const capacityDraft150 = (agent: AgentName, empty: EmptyNext, miles: number, signer: Signer, fold?: string | null): Draft => {
  const about = roundMiles(miles);
  const body =
    `Morning ${agent.first_name} — ${signerWord(signer)} at ${COMPANY}. ${emptyLine(empty)}, within about ${about} miles of your freight. ` +
    `Open to anything working out of there. Anything I can look at?` +
    (fold ? `\n\nAlso — ${fold}` : "") +
    signOff(signer);
  return {
    subject: `${emptyTense(empty) === "now" ? "Empty" : "Going empty"} ${placeLabel(empty)} ${emptyWhenLabel(empty, "long")} — about ${about} miles from your freight`,
    body,
  };
};

// The text-message variant — one screen, no signature block. The short label
// ("Fri 2pm") keeps it inside 160 characters; "now" and "after our next
// drop" read the same in either style.
export const capacityText150 = (agent: AgentName, empty: EmptyNext, miles: number, signer: Signer, fold?: string | null): string =>
  `Morning ${agent.first_name} — ${signerWord(signer)}, ${COMPANY}. Empty ${placeLabel(empty)} ${emptyWhenLabel(empty, "short")}, ` +
  `~${roundMiles(miles)} mi from your freight. Anything working out of there I can look at?` +
  (fold ? ` Also — ${fold}` : "");

// ---- ② milestone ----
const NEXT_WORD: Record<number, string> = { 5: "five", 10: "ten", 25: "twenty-five", 50: "fifty", 100: "hundred" };

// The sentence after the dash — reused bare inside a combined message.
export const milestoneSentence = (kind: MilestoneKind, n: number, years: number | null = null): string => {
  switch (kind) {
    case "loads":
      return `that was our ${ordinal(n)} load together. Appreciate you keeping us busy; here's to the next ${NEXT_WORD[n] ?? n}.`;
    case "streak":
      return `that's ${n} straight for you, all on time and claim-free. That's the whole idea over here. Thanks for the trust.`;
    case "anniversary":
      return `${years == null || years <= 1 ? "a year" : `${years} years`} ago this week we ran our first load for you. Glad to still be on your list.`;
  }
};

const MILESTONE_SUBJECT: Record<MilestoneKind, string> = {
  loads: "load together",
  streak: "straight, on time and claim-free",
  anniversary: "since our first load",
};

export const milestoneDraft = (kind: MilestoneKind, n: number, agent: AgentName, signer: Signer, years: number | null = null): Draft => ({
  subject:
    kind === "loads"
      ? `Our ${ordinal(n)} ${MILESTONE_SUBJECT.loads}`
      : kind === "streak"
        ? `${n} ${MILESTONE_SUBJECT.streak}`
        : `${years == null || years <= 1 ? "A year" : `${years} years`} ${MILESTONE_SUBJECT.anniversary}`,
  body: `${agent.first_name} — ${milestoneSentence(kind, n, years)}${signOff(signer)}`,
});

// ---- ③ holiday ----
export const holidaySentence = (kind: HolidayKind, year: number): string =>
  kind === "thanksgiving"
    ? `Happy Thanksgiving from ${COMPANY}. Genuinely thankful for your business this year. No ask — just wanted to say it.`
    : `Happy New Year. Looking forward to running for you in ${year}.`;

export const holidayDraft = (kind: HolidayKind, agent: AgentName, signer: Signer, year: number): Draft => ({
  subject: kind === "thanksgiving" ? `Happy Thanksgiving from ${COMPANY}` : `Happy New Year from ${COMPANY}`,
  body: `${agent.first_name} — ${holidaySentence(kind, year)}${signOff(signer)}`,
});

export const holidayLabel = (kind: HolidayKind): string => HOLIDAY_LABEL[kind];

// ---- the delivery close-out (operational — never capped) ----
// The thank-you that turns into inbound freight; the empty line comes from
// the same anchor the Foreman and the capacity pass use.
export const closeOutDraft = (load: Load, allLoads: Load[], signer: Signer): Draft => {
  const e = emptyNextWhen(allLoads);
  const nextLine = e ? ` ${emptyLine(e)} if anything's moving.` : "";
  return {
    subject: `Delivered — ${load.load_number}, ${load.origin_city} → ${load.destination_city}`,
    body: `Delivered and signed clean, no OS&D. Appreciate the freight.${nextLine}${signOff(signer)}`,
  };
};

export const draftText = (d: Draft): string => `${d.subject}\n\n${d.body}`;
