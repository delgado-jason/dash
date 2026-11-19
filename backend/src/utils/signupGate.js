// The front door. Signup mints an OWNER (admin) token, so on a running dash it
// is closed: the owner adds logins under Settings → Team. It opens in exactly
// two cases — a dash with no users yet (a fresh install, or a restore into an
// empty database, has to be able to make its first owner), or ALLOW_SIGNUP=true
// set on the server by someone who means it. Unset is closed; "1", "yes" and
// "True" are closed too — the flag is the word true, so a half-typed value
// never opens the door by accident.
export const SIGNUP_CLOSED =
  "Signup is closed. The owner adds logins under Settings → Team.";

export function signupOpen({ allowSignup, userCount }) {
  if (allowSignup === "true") return true;
  return Number.isInteger(userCount) && userCount === 0;
}
