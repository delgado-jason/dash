// Auth for machine callers — the DTS server's ingest agent registering
// documents. Constant-time compare against DASH_SERVICE_TOKEN; the caller
// acts as the account in DASH_SERVICE_ACCOUNT. If either env var is
// missing, every request is 401 — fail closed, never open.
import crypto from "crypto";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireServiceToken(req, res, next) {
  const token = process.env.DASH_SERVICE_TOKEN;
  const account = process.env.DASH_SERVICE_ACCOUNT;
  // A malformed account id is the same as no configuration: fail loudly
  // here, not as per-request pg errors deep in the service layer.
  if (!token || !account || !UUID_RE.test(account)) {
    return res.status(401).json({ error: "Service access not configured" });
  }
  const given = Buffer.from(req.get("X-Service-Token") || "");
  const expected = Buffer.from(token);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return res.status(401).json({ error: "Invalid service token" });
  }
  req.user = {
    user_id: account,
    self_id: account,
    account_id: account,
    role: "service",
  };
  return next();
}
