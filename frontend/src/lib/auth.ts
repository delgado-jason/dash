// Client-side session helpers. We only read the JWT's expiry here — signature
// verification is the server's job. The point is to avoid rendering a protected
// page on a dead token and then getting 401-bounced ("loads, then kicks to
// login"), which is what happens on mobile after the app sits idle past the
// token's 1h lifetime.

export const isTokenValid = (token: string | null): token is string => {
  if (!token) return false;
  try {
    const seg = token.split(".")[1];
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.length % 4 ? b64 + "=".repeat(4 - (b64.length % 4)) : b64;
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};

// Drop everything a session keeps, in one place.
export const clearSession = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user_id");
  localStorage.removeItem("role");
  localStorage.removeItem("display_name");
};
