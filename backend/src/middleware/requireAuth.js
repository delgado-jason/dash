import { verifyToken, signToken } from "../utils/jwt.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = header.split(" ")[1];

  try {
    const payload = verifyToken(token);

    // Delegated access: data scopes to the account OWNER (account_id), while the
    // logged-in person's own id rides along as self_id for identity. Old tokens
    // (pre-roles) have no account_id/role → fall back to owner/admin.
    const accountId = payload.account_id ?? payload.user_id;
    req.user = {
      user_id: accountId, // data scope = the account owner's id
      self_id: payload.user_id, // the actual logged-in user (identity)
      account_id: accountId,
      role: payload.role ?? "admin",
    };

    // Sliding session: once the token is past the halfway point of its lifetime,
    // hand back a fresh one via a response header so an active session keeps
    // renewing and never expires mid-work. Preserves identity claims (and upgrades
    // an old token to carry account_id/role).
    if (payload.iat && payload.exp) {
      const nowSec = Math.floor(Date.now() / 1000);
      const halfway = payload.iat + (payload.exp - payload.iat) / 2;
      if (nowSec >= halfway) {
        res.set(
          "X-Refreshed-Token",
          signToken({
            user_id: payload.user_id,
            account_id: accountId,
            role: req.user.role,
          }),
        );
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
