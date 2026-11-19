// The client's copy of the server's one rule for a new password
// (backend/src/utils/validation/passwordValidation.js): length only, ten to
// seventy-two. The server is the truth and refuses with the same sentences;
// a form uses this to say so before the round trip, not instead of it.
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;

// The hint under an empty password box.
export const PASSWORD_HINT = `at least ${PASSWORD_MIN} characters`;

// The one problem with a candidate password, as the sentence the form shows;
// null when it passes.
export function passwordProblem(password: string): string | null {
  if (password.length === 0) return "A password is required.";
  if (password.length < PASSWORD_MIN) {
    return `A password needs at least ${PASSWORD_MIN} characters.`;
  }
  // bcrypt reads 72 BYTES; the server counts the same way.
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) {
    return `A password can be at most ${PASSWORD_MAX} characters.`;
  }
  return null;
}
