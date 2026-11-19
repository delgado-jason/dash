// The login door's brake. Counts FAILED sign-ins (the route's 401) per email and
// per address over a sliding window, in memory; past the limit the door answers
// 429 with a sentence and a Retry-After, and the route never runs — so bcrypt
// isn't spent on a guesser either. A success clears that email's count.
//
// In memory on purpose: one Railway instance, two real users. A redeploy
// forgets the counts, which is fine — a guesser who waited for a deploy got
// fifteen minutes, not a password. Per EMAIL so an account can't be ground
// down from many addresses; per ADDRESS so one address can't walk an address
// book. The address needs `trust proxy` set on the app (server.js) or every
// visitor shares Railway's proxy IP and fifty strangers' typos would lock the
// door for the two people who live here.

export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_PER_EMAIL = 10;
export const MAX_PER_IP = 50;

// The two keys a request counts under. The email folds case and edges so
// " Brandie@X.com" and "brandie@x.com" are one door; no email, no email key.
export function throttleKeys(req) {
  const raw = req?.body?.email;
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const ip = typeof req?.ip === "string" && req.ip ? req.ip : "unknown";
  return { emailKey: email ? "email:" + email : null, ipKey: "ip:" + ip };
}

export function tooManyWord(retryAfterSec) {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return (
    "Too many failed sign-ins. Wait " +
    minutes +
    (minutes === 1 ? " minute" : " minutes") +
    " and try again."
  );
}

export function createLoginThrottle({
  windowMs = WINDOW_MS,
  maxPerEmail = MAX_PER_EMAIL,
  maxPerIp = MAX_PER_IP,
  now = Date.now,
} = {}) {
  // key → the failure timestamps still inside the window, oldest first
  const failures = new Map();
  let calls = 0;

  const live = (key, t) => {
    const arr = failures.get(key);
    if (!arr) return [];
    const kept = arr.filter((ts) => t - ts < windowMs);
    if (kept.length) failures.set(key, kept);
    else failures.delete(key);
    return kept;
  };

  const count = (key, t = now()) => (key ? live(key, t).length : 0);

  const fail = (key, t = now()) => {
    if (!key) return;
    const kept = live(key, t);
    kept.push(t);
    failures.set(key, kept);
  };

  const clear = (key) => {
    if (key) failures.delete(key);
  };

  // Seconds until the oldest failure in the window ages out — the moment one
  // more try is allowed. What Retry-After promises.
  const retryAfterSec = (key, t = now()) => {
    const kept = live(key, t);
    if (!kept.length) return 0;
    return Math.max(1, Math.ceil((kept[0] + windowMs - t) / 1000));
  };

  // Keys nobody has touched since their window closed would otherwise sit in
  // the map forever; drop them now and then.
  const sweep = (t) => {
    for (const key of [...failures.keys()]) live(key, t);
  };

  const middleware = (req, res, next) => {
    const t = now();
    if (++calls % 200 === 0) sweep(t);

    const { emailKey, ipKey } = throttleKeys(req);
    const blockedBy =
      count(emailKey, t) >= maxPerEmail
        ? emailKey
        : count(ipKey, t) >= maxPerIp
          ? ipKey
          : null;

    if (blockedBy) {
      const wait = retryAfterSec(blockedBy, t);
      res.set("Retry-After", String(wait));
      return res.status(429).json({ error: tooManyWord(wait) });
    }

    // Score the attempt by how the route answered: only a 401 is a failure
    // (a 400 is a missing field, not a guess); a 200 wipes the email's slate.
    res.on("finish", () => {
      if (res.statusCode === 401) {
        const at = now();
        fail(emailKey, at);
        fail(ipKey, at);
      } else if (res.statusCode === 200) {
        clear(emailKey);
      }
    });

    return next();
  };

  return {
    middleware,
    count,
    fail,
    clear,
    retryAfterSec,
    size: () => failures.size,
    reset: () => failures.clear(),
  };
}

// The one the login route mounts.
export const loginThrottle = createLoginThrottle();
