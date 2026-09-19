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

// What dash asks Kit to create. By default Kit makes a new subscriber `active`
// at once — on the list, no confirmation email, no click. With
// KIT_DOUBLE_OPT_IN=1 (Railway) the subscriber is created `inactive`, so that
// adding it to the form is a real subscription: Kit sends the form's
// confirmation email and only the reader's click makes it active. dash then
// shows the row as `sent` until the next sync sees Kit's `active` and writes
// `confirmed`. The switch is a Railway variable because whether Kit honours it
// for API-added subscribers is Jason's inbox to prove, and it must be one
// step to turn back off.
export function kitCreatePayload(email, doubleOptIn) {
  const payload = { email_address: email };
  if (doubleOptIn) payload.state = "inactive";
  return payload;
}

export const isDoubleOptIn = (env = process.env) => env.KIT_DOUBLE_OPT_IN === "1";
