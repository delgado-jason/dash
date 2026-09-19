// Kit's subscriber `state` → dash's kit_status, or null when the state says
// nothing dash should act on.
//
// Kit knows two things dash can't: whether the reader clicked the confirmation
// link (state `active`) and whether they left (`cancelled`), bounced, or
// complained — all three of which mean the same thing to a list: stop. A
// subscriber Kit has mailed but who hasn't clicked yet is `inactive`, which is
// exactly dash's `sent`, so it maps to nothing and the row keeps its status.
// Any state this table doesn't name is left alone rather than guessed at.
//   https://developers.kit.com/api-reference/subscribers/get-a-subscriber
export const KIT_STATE_TO_STATUS = Object.freeze({
  active: "confirmed",
  cancelled: "unsubscribed",
  bounced: "unsubscribed",
  complained: "unsubscribed",
});

export function kitStateToStatus(state) {
  if (typeof state !== "string") return null;
  return KIT_STATE_TO_STATUS[state.trim().toLowerCase()] ?? null;
}

// What dash asks Kit to create: the address, nothing else. Kit makes the
// subscriber `active` at once — on the list, no confirmation email, no click.
// Single opt-in is the only mode that works through Kit's API: a subscriber
// created `inactive` and added to a double opt-in form gets the confirmation
// email, but the click never turns it active (proven 2026-09-19, subscriber
// 4301885269), so it would sit unreachable forever. Unsubscribing is Kit's
// link in every email either way.
export function kitCreatePayload(email) {
  return { email_address: email };
}
