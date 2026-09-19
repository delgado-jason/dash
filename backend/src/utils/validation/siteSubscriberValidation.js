import { ValidationError } from "../error.js";

// The signup body, as the website's /api/subscribe function posts it. Unlike
// the beacon (siteHitValidation), there is no SQL function behind this one
// owning the real rules — the service does — so this is where a body stops
// being a stranger's JSON and becomes four known strings.
//
// It refuses rather than repairs. A page view that arrives slightly wrong is
// worth keeping bent; an email address that arrives slightly wrong is a
// person who will never get the confirmation and will never know why, so the
// site hears 400 and can say so at the form while they are still looking at it.

// The whole shape check. Deliberately pragmatic, not RFC 5322: one @, no
// whitespace, and a dot in the domain with at least two characters after it.
// Anything stricter starts refusing real addresses, and anything this misses
// (a typo'd domain that exists) only Kit's confirmation email can catch.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// 254 is the longest an address can legally be end to end. 40 is far more
// than a date-shaped consent version ("2026-09-18") needs, and 200 matches the
// path limit record_site_hit enforces — the same paths arrive at both doors.
const EMAIL_MAX = 254;
const CONSENT_MAX = 40;
const PATH_MAX = 200;

// Where a signup came from when the form didn't say. The Logbook is the only
// place the form exists, so this is a truthful fallback rather than an
// "unknown" the page would have to explain.
export const DEFAULT_SOURCE_PATH = "/logbook";

export function parseSiteSubscriber(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("body must be an object");
  }

  const { host, email, source_path, consent_version } = body;

  if (typeof host !== "string" || host.trim() === "") {
    throw new ValidationError("host is required");
  }

  if (typeof email !== "string") {
    throw new ValidationError("email is required");
  }

  if (typeof consent_version !== "string" || consent_version.trim() === "") {
    throw new ValidationError("consent_version is required");
  }

  // Trimmed, but NOT lowercased: what he mails is what they typed. The
  // database folds the case in email_key for the uniqueness rule (082), so
  // Jay@ and jay@ are still one subscriber.
  const trimmed = email.trim();

  if (trimmed.length > EMAIL_MAX) {
    throw new ValidationError("email is too long");
  }

  // Checked on its own, before the shape, so the message names what is
  // actually wrong — a pasted address with a stray space inside it is the
  // common case and "email must not contain spaces" is something the form can
  // repeat back to a person.
  if (/\s/.test(trimmed)) {
    throw new ValidationError("email must not contain spaces");
  }

  if (!EMAIL_SHAPE.test(trimmed)) {
    throw new ValidationError("email is not a valid address");
  }

  const consent = consent_version.trim();
  if (consent.length > CONSENT_MAX) {
    throw new ValidationError("consent_version is too long");
  }

  // Absent is fine — the default above. Present and wrong is not: a path that
  // doesn't start with / is a full URL or a bare word, and either would show
  // up on the Website page's "from" column as something Jason can't click
  // through to.
  let path = DEFAULT_SOURCE_PATH;
  if (source_path != null) {
    if (typeof source_path !== "string" || !source_path.startsWith("/")) {
      throw new ValidationError("source_path must start with /");
    }
    if (source_path.length > PATH_MAX) {
      throw new ValidationError("source_path is too long");
    }
    path = source_path;
  }

  return {
    host: host.trim(),
    email: trimmed,
    source_path: path,
    consent_version: consent,
  };
}
