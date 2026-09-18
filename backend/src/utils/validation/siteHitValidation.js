import { ValidationError } from "../error.js";

// The beacon's body, as the website's /api/hit function posts it. Every field
// is a string or null; the SQL function (record_site_hit, migration 081) owns
// the real rules — which host counts, the Central day, the salted 24-hour
// visitor hash, the rate limits — and refuses silently. This only turns away
// shapes that could never be a page view, so a stranger's junk gets a 400
// instead of a database round trip.
export const HIT_FIELDS = ["host", "path", "ref_host", "country", "region", "ip", "ua", "device"];

// Longest a field may be. The user agent is TRUNCATED rather than refused —
// it feeds the visitor hash, and cutting it the same way every time keeps the
// hash stable for that browser; a refusal would drop a real person's view.
const MAX_LEN = { host: 253, path: 200, ref_host: 120, country: 2, region: 3, ip: 45, ua: 512, device: 16 };
export const UA_MAX = MAX_LEN.ua;

export function parseSiteHit(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("body must be an object");
  }
  const hit = {};
  for (const field of HIT_FIELDS) {
    const value = body[field];
    if (value == null) {
      hit[field] = null;
      continue;
    }
    if (typeof value !== "string") throw new ValidationError(`${field} must be a string`);
    if (field === "ua") {
      hit[field] = value.length > UA_MAX ? value.slice(0, UA_MAX) : value;
      continue;
    }
    if (value.length > MAX_LEN[field]) throw new ValidationError(`${field} is too long`);
    hit[field] = value;
  }
  if (!hit.host) throw new ValidationError("host is required");
  if (!hit.path || !hit.path.startsWith("/")) throw new ValidationError("path must start with /");
  return hit;
}
