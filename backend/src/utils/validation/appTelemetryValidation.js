import { ValidationError } from "../error.js";

// The two bodies dash's own beacons post about themselves: a page opened, an
// error caught. Unlike the website's beacon (siteHitValidation) the caller is
// a signed-in person, so nothing here is a stranger's JSON — but a stack trace
// can be any length and a message any shape, so this trims rather than
// refuses: an error report refused for being long is an error nobody sees.

export const PATH_MAX = 200;
export const MESSAGE_MAX = 500;
export const STACK_MAX = 4000;
export const UA_MAX = 300;
export const VERSION_MAX = 40;
export const KINDS = ["error", "rejection", "render"];

// The page a path belongs to. The first segment is the page; a later segment
// stays when it is a plain lowercase word (/maintenance/report, /loads/new) and
// becomes "·" when it is an id — a load number, a uuid, an agency code — so
// /loads/9960798 and /loads/1377873 count as one page, /loads/·. The query and
// the hash never count.
export function pageOf(path) {
  const clean = String(path ?? "").split("?")[0].split("#")[0];
  const segs = clean.split("/").filter(Boolean);
  if (segs.length === 0) return "/";
  return "/" + segs.map((s, i) => (i === 0 || /^[a-z][a-z-]*$/.test(s) ? s : "·")).join("/");
}

const text = (v, max, name) => {
  if (v == null) return null;
  if (typeof v !== "string") throw new ValidationError(name + " must be a string");
  const t = v.trim();
  if (t === "") return null;
  return t.length > max ? t.slice(0, max) : t;
};

const object = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("body must be an object");
  }
};

export function parseAppHit(body) {
  object(body);
  const path = text(body.path, PATH_MAX, "path");
  if (!path || !path.startsWith("/")) throw new ValidationError("path must start with /");
  return { path, page: pageOf(path) };
}

export function parseAppError(body) {
  object(body);
  const message = text(body.message, MESSAGE_MAX, "message");
  if (!message) throw new ValidationError("message is required");
  const rawPath = text(body.path, PATH_MAX, "path");
  const path = rawPath && rawPath.startsWith("/") ? rawPath : "/";
  const kind = KINDS.includes(body.kind) ? body.kind : "error";
  return {
    message,
    stack: text(body.stack, STACK_MAX, "stack"),
    kind,
    path,
    page: pageOf(path),
    app_version: text(body.app_version, VERSION_MAX, "app_version"),
    user_agent: text(body.user_agent, UA_MAX, "user_agent"),
  };
}

// ?days= on the two reads: a whole number of days, 1 to 365, else the fallback.
export function clampDays(v, fallback = 30) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : fallback;
}
