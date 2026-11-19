import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  createLoginThrottle,
  throttleKeys,
  tooManyWord,
  MAX_PER_EMAIL,
  MAX_PER_IP,
  WINDOW_MS,
} from "./loginThrottle.js";

// A response that remembers what the middleware did to it and can be told how
// the route finished.
const fakeRes = () => {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.body = undefined;
  res.set = (k, v) => {
    res.headers[k] = v;
    return res;
  };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    return res;
  };
  res.finishWith = (code) => {
    res.statusCode = code;
    res.emit("finish");
  };
  return res;
};

const req = (email, ip = "10.0.0.1") => ({ body: { email }, ip });

// Run one attempt through the middleware; returns what happened.
const attempt = (th, r, routeStatus) => {
  const res = fakeRes();
  let passed = false;
  th.middleware(r, res, () => {
    passed = true;
  });
  if (passed && routeStatus != null) res.finishWith(routeStatus);
  return { passed, res };
};

describe("throttleKeys — what a request counts under", () => {
  test("the email folds case and edges; the address is its own key", () => {
    assert.deepEqual(throttleKeys(req(" Brandie@X.com ", "1.2.3.4")), {
      emailKey: "email:brandie@x.com",
      ipKey: "ip:1.2.3.4",
    });
  });

  test("no email, no email key; no address reads unknown", () => {
    assert.deepEqual(throttleKeys({ body: {}, ip: undefined }), {
      emailKey: null,
      ipKey: "ip:unknown",
    });
    assert.equal(throttleKeys({ body: { email: 7 } }).emailKey, null);
  });
});

describe("the login throttle — ten failures on an email close the door", () => {
  test("the tenth failure still passes; the eleventh try is a 429 with Retry-After", () => {
    let t = 0;
    const th = createLoginThrottle({ now: () => t });
    for (let i = 0; i < MAX_PER_EMAIL; i++) {
      const { passed } = attempt(th, req(" Brandie@X.com "), 401);
      assert.equal(passed, true, "attempt " + (i + 1));
      t += 1000;
    }
    const { passed, res } = attempt(th, req("brandie@x.com"));
    assert.equal(passed, false);
    assert.equal(res.statusCode, 429);
    assert.match(res.body.error, /^Too many failed sign-ins\. Wait 15 minutes and try again\.$/);
    assert.equal(Number(res.headers["Retry-After"]), Math.ceil((WINDOW_MS - 10000) / 1000));
  });

  test("a different email from the same address still passes — the address limit is fifty", () => {
    const th = createLoginThrottle({ now: () => 0 });
    for (let i = 0; i < MAX_PER_EMAIL; i++) attempt(th, req("a@x.com"), 401);
    assert.equal(attempt(th, req("a@x.com")).passed, false);
    assert.equal(attempt(th, req("b@x.com")).passed, true);
  });

  test("a success wipes that email's slate", () => {
    const th = createLoginThrottle({ now: () => 0 });
    for (let i = 0; i < MAX_PER_EMAIL - 1; i++) attempt(th, req("a@x.com"), 401);
    assert.equal(th.count("email:a@x.com"), MAX_PER_EMAIL - 1);
    attempt(th, req("a@x.com"), 200);
    assert.equal(th.count("email:a@x.com"), 0);
    // the address still remembers — a success on one email is not amnesty for the address
    assert.equal(th.count("ip:10.0.0.1"), MAX_PER_EMAIL - 1);
  });

  test("the window slides: when the oldest failure ages out, one more try is allowed", () => {
    let t = 0;
    const th = createLoginThrottle({ now: () => t });
    for (let i = 0; i < MAX_PER_EMAIL; i++) {
      attempt(th, req("a@x.com"), 401);
      t += 60_000; // one failure a minute: the first at 0, the tenth at 9 min
    }
    assert.equal(attempt(th, req("a@x.com")).passed, false);
    t = WINDOW_MS; // the failure at 0 has aged out; nine remain
    assert.equal(attempt(th, req("a@x.com"), 401).passed, true);
    assert.equal(attempt(th, req("a@x.com")).passed, false); // back to ten
  });

  test("a 400 or a 429 is not a failure — only the route's 401 counts", () => {
    const th = createLoginThrottle({ now: () => 0 });
    attempt(th, req("a@x.com"), 400);
    attempt(th, req("a@x.com"), 500);
    assert.equal(th.count("email:a@x.com"), 0);
    for (let i = 0; i < MAX_PER_EMAIL; i++) attempt(th, req("a@x.com"), 401);
    attempt(th, req("a@x.com")); // the 429 itself
    assert.equal(th.count("email:a@x.com"), MAX_PER_EMAIL);
  });

  test("fifty failures from one address close it for every email", () => {
    const th = createLoginThrottle({ now: () => 0 });
    for (let i = 0; i < MAX_PER_IP; i++) attempt(th, req("guess" + i + "@x.com", "9.9.9.9"), 401);
    assert.equal(attempt(th, req("fresh@x.com", "9.9.9.9")).passed, false);
    assert.equal(attempt(th, req("fresh@x.com", "9.9.9.8")).passed, true);
  });

  test("a request with no email is counted on the address only", () => {
    const th = createLoginThrottle({ now: () => 0 });
    attempt(th, { body: {}, ip: "7.7.7.7" }, 401);
    assert.equal(th.count("ip:7.7.7.7"), 1);
    assert.equal(th.size(), 1);
  });

  test("the limits are the documented ones", () => {
    assert.equal(MAX_PER_EMAIL, 10);
    assert.equal(MAX_PER_IP, 50);
    assert.equal(WINDOW_MS, 15 * 60 * 1000);
  });
});

describe("tooManyWord — the sentence on the door", () => {
  test("rounds the wait up to whole minutes and says minute for one", () => {
    assert.equal(tooManyWord(1), "Too many failed sign-ins. Wait 1 minute and try again.");
    assert.equal(tooManyWord(61), "Too many failed sign-ins. Wait 2 minutes and try again.");
    assert.equal(tooManyWord(900), "Too many failed sign-ins. Wait 15 minutes and try again.");
  });
});
