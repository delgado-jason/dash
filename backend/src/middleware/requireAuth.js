import crypto from "crypto";
import { verifyToken, signToken } from "../utils/jwt.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The methods the watch token may use: it reads, it never writes.
export const READ_METHODS = new Set(["GET", "HEAD"]);

// The watch token in constant time. Unset means there is no such door.
export function watchTokenMatches(given, expected) {
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// What the watch token acts as: the owner, for reading — every GET the pages
// read answers as it would to Jason — with `watch` set so a route can tell.
export function watchUser(account) {
  return {
    user_id: account,
    self_id: account,
    account_id: account,
    role: "admin",
    watch: true,
  };
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = header.split(" ")[1];

  // The watch token: a read-only machine identity for the watcher on the DTS
  // server and the morning integrity run. It reads as the owner of the account
  // in DASH_SERVICE_ACCOUNT (the account the vault's token acts for too) and
  // is refused on anything but a read. Checked before the JWT so a watcher
  // never needs a password or a signed token that could slide into a session.
  if (watchTokenMatches(token, process.env.DASH_WATCH_TOKEN)) {
    const account = process.env.DASH_SERVICE_ACCOUNT;
    if (!account || !UUID_RE.test(account)) {
      return res.status(401).json({ message: "Watch access not configured" });
    }
    if (!READ_METHODS.has(req.method)) {
      return res.status(403).json({ error: "The watch token reads only." });
    }
    req.user = watchUser(account);
    return next();
  }

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
