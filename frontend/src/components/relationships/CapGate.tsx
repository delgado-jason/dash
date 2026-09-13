import type { AgentContact } from "@/services/agentContactsService";
import { contactTypeLabel, type ContactType } from "@/lib/relationships/contactTypes";
import { weekdayShort } from "@/lib/relationships/dayKeys";
import { GhostButton, PrimaryButton } from "./primitives";

// THE CAP, on the button row (REL-01 v2.0 §4): one proactive touch per agent
// per week. When this week's message already went out, the log button gives
// way to a plain sentence and the doors that apply:
//   • a MESSAGE (LogTouchForm, the agent sheet) may FOLD this reason into
//     that message (a PATCH; nothing new is created) or LOG ANYWAY with a
//     note saying why. A reason the message already carries has nothing to
//     fold.
//   • a CALL (the call screen) is never folded — it carries an outcome that a
//     fold would erase — so the gate is rendered without `onFold`: the Fold
//     door is hidden and the sentence says the call is logged as it happened.
// One component, shared, so the cap reads the same everywhere.

interface Props {
  firstName: string;
  first: AgentContact; // the week's first proactive message
  type: ContactType; // the reason being added
  carried: boolean; // that message already carries this reason
  busy: boolean;
  noteEmpty: boolean; // "Log anyway" needs a reason in the note
  onFold?: () => void; // absent = a call: no fold door
  onLogAnyway: () => void;
  logAnywayLabel?: string;
}

export const CapGate = ({ firstName, first, type, carried, busy, noteEmpty, onFold, onLogAnyway, logAnywayLabel = "Log anyway" }: Props) => {
  const day = weekdayShort(first.contacted_at);
  const secondHalf = onFold
    ? carried
      ? `${contactTypeLabel(type)} is already in ${day}'s message — nothing to fold. Pick another reason, or wait.`
      : "One per week: fold this reason into that message, or wait."
    : "A call that happened is logged as it happened — say why in the note.";
  return (
    <div className="mt-3">
      <p className="font-condensed text-[13px] text-ink leading-snug">
        {firstName} already had a proactive touch this week — {contactTypeLabel(first.type)}, {day}. {secondHalf}
      </p>
      <div className="flex gap-2 flex-wrap mt-2">
        {onFold && (
          <PrimaryButton size="lg" disabled={busy || carried} title={carried ? `already in ${day}'s message` : undefined} onClick={() => !carried && onFold()}>
            {busy ? "Saving…" : carried ? `Already in ${day}'s message` : `Fold into ${day}'s message`}
          </PrimaryButton>
        )}
        <GhostButton
          size="lg"
          disabled={busy || noteEmpty}
          title={noteEmpty ? "Say why in the note — a second touch needs a reason" : undefined}
          onClick={onLogAnyway}
        >
          {busy && !onFold ? "Saving…" : logAnywayLabel}
        </GhostButton>
      </div>
    </div>
  );
};
