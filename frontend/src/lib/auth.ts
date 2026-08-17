// Client-side session helpers. We only read the JWT's expiry here — signature
// verification is the server's job. The point is to avoid rendering a protected
// page on a dead token and then getting 401-bounced ("loads, then kicks to
// login"), which is what happens on mobile after the app sits idle past the
// token's 1h lifetime.

// Seconds-since-epoch expiry of a JWT, or null if it can't be read.
export const tokenExp = (token: string | null): number | null => {
  if (!token) return null;
  try {
    const seg = token.split(".")[1];
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.length % 4 ? b64 + "=".repeat(4 - (b64.length % 4)) : b64;
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
};

export const isTokenValid = (token: string | null): token is string => {
  const exp = tokenExp(token);
  return exp !== null && exp * 1000 > Date.now();
};

// A sliding-session refresh may only ever EXTEND the session. We ignore anything
// unreadable, already expired, or no newer than what we're holding — so a stale
// token replayed out of a cached response can never clobber a live one. Returns
// whether the token was adopted.
export const adoptRefreshedToken = (refreshed: string): boolean => {
  const next = tokenExp(refreshed);
  if (next === null || next * 1000 <= Date.now()) return false;

  const current = tokenExp(localStorage.getItem("token"));
  if (current !== null && next <= current) return false;

  localStorage.setItem("token", refreshed);
  return true;
};

// A session is only usable when ALL of its parts are present — a valid token
// alone isn't an identity. A half-cleared or cross-tab-clobbered storage
// (token from one login, user_id/role from another or missing) must read as
// "not signed in", never as "default to the admin view" (2026-08-16: Jason
// hit exactly that chimera — dispatch board with a no-name user and someone
// else's award storm).
export const hasCompleteSession = (): boolean =>
  isTokenValid(localStorage.getItem("token")) &&
  !!localStorage.getItem("user_id") &&
  !!localStorage.getItem("role");

// Drop everything a session keeps, in one place.
export const clearSession = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user_id");
  localStorage.removeItem("role");
  localStorage.removeItem("display_name");
};
