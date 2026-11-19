import { ValidationError } from "../error.js";

// The one rule for a NEW password, applied at every door that sets one: signup
// (when the door is open), adding a dispatcher, the owner resetting a
// dispatcher's, anyone changing their own, and the break-glass script. Length
// only, on purpose: composition rules ("one capital, one symbol") push people
// to Password1! and a sticky note; length is what buys time against guessing,
// and the login door's throttle (middleware/loginThrottle) does the rest.
export const PASSWORD_MIN = 10;

// bcrypt reads the first 72 bytes and silently ignores the rest, so a longer
// password is a promise the hash can't keep. Refuse rather than pretend.
export const PASSWORD_MAX = 72;

// Every problem as a sentence the form can repeat back. Empty = fine.
export function passwordErrors(password) {
  if (typeof password !== "string" || password.length === 0) {
    return ["A password is required."];
  }
  if (password.length < PASSWORD_MIN) {
    return ["A password needs at least " + PASSWORD_MIN + " characters."];
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX) {
    return ["A password can be at most " + PASSWORD_MAX + " characters."];
  }
  return [];
}

// The service-side form: the first problem, as the 400 the route sends.
export function assertPassword(password) {
  const [first] = passwordErrors(password);
  if (first) throw new ValidationError(first);
}
