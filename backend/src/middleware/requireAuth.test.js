import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { requireAuth, watchTokenMatches, watchUser } from "./requireAuth.js";

// The watch token door only; the JWT path is exercised by the running API.
// No database: requireAuth reads env and headers and nothing else.

const ACCOUNT = "a0000000-0000-0000-0000-000000000001";
const TOKEN = "watch-token-for-the-test-only";

const fakeRes = () => {
  const res = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    return res;
  };
  res.set = (k, v) => {
    res.headers[k] = v;
    return res;
  };
  return res;
};

const run = (method, bearer) => {
  const req = { method, headers: { authorization: bearer ? "Bearer " + bearer : undefined } };
  const res = fakeRes();
  let passed = false;
  requireAuth(req, res, () => {
    passed = true;
  });
  return { passed, res, req };
};

let saved;
beforeEach(() => {
  saved = {
    watch: process.env.DASH_WATCH_TOKEN,
    account: process.env.DASH_SERVICE_ACCOUNT,
    secret: process.env.JWT_SECRET,
  };
  process.env.DASH_WATCH_TOKEN = TOKEN;
  process.env.DASH_SERVICE_ACCOUNT = ACCOUNT;
  process.env.JWT_SECRET = "a-secret-for-the-test";
});
afterEach(() => {
  for (const [k, v] of [
    ["DASH_WATCH_TOKEN", saved.watch],
    ["DASH_SERVICE_ACCOUNT", saved.account],
    ["JWT_SECRET", saved.secret],
  ]) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("watchTokenMatches — the constant-time compare", () => {
  test("equal strings match; different, empty, or unset do not", () => {
    assert.equal(watchTokenMatches("abc", "abc"), true);
    assert.equal(watchTokenMatches("abc", "abd"), false);
    assert.equal(watchTokenMatches("abc", "abcd"), false);
    assert.equal(watchTokenMatches("", ""), false);
    assert.equal(watchTokenMatches("abc", undefined), false);
    assert.equal(watchTokenMatches(undefined, "abc"), false);
  });
});

describe("requireAuth — the watch token door", () => {
  test("a GET with the watch token reads as the owner, marked watch", () => {
    const { passed, req } = run("GET", TOKEN);
    assert.equal(passed, true);
    assert.deepEqual(req.user, watchUser(ACCOUNT));
    assert.equal(req.user.role, "admin");
    assert.equal(req.user.watch, true);
  });

  test("HEAD passes too; POST, PATCH and DELETE are 403 — it reads only", () => {
    assert.equal(run("HEAD", TOKEN).passed, true);
    for (const m of ["POST", "PATCH", "PUT", "DELETE"]) {
      const { passed, res } = run(m, TOKEN);
      assert.equal(passed, false, m);
      assert.equal(res.statusCode, 403, m);
      assert.match(res.body.error, /reads only/);
    }
  });

  test("with the token unset on the server, the same bearer is just an invalid JWT (401)", () => {
    delete process.env.DASH_WATCH_TOKEN;
    const { passed, res } = run("GET", TOKEN);
    assert.equal(passed, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, "Invalid or expired token");
  });

  test("a watch token with no account configured is a 401, never an open door", () => {
    delete process.env.DASH_SERVICE_ACCOUNT;
    const { passed, res } = run("GET", TOKEN);
    assert.equal(passed, false);
    assert.equal(res.statusCode, 401);
    process.env.DASH_SERVICE_ACCOUNT = "not-a-uuid";
    assert.equal(run("GET", TOKEN).res.statusCode, 401);
  });

  test("no bearer at all is the usual 401", () => {
    const { passed, res } = run("GET", undefined);
    assert.equal(passed, false);
    assert.equal(res.statusCode, 401);
  });
});
