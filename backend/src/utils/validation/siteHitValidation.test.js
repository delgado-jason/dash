import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseSiteHit, HIT_FIELDS, UA_MAX } from "./siteHitValidation.js";

const good = {
  host: "delgadotruckingservices.com",
  path: "/capabilities",
  ref_host: "google.com",
  country: "US",
  region: "AL",
  ip: "203.0.113.9",
  ua: "Mozilla/5.0",
  device: "desktop",
};

describe("parseSiteHit — the beacon's body", () => {
  test("a full body passes through untouched", () => {
    assert.deepEqual(parseSiteHit(good), good);
  });

  test("missing optional fields become null; host and path stay", () => {
    const hit = parseSiteHit({ host: good.host, path: "/" });
    for (const f of HIT_FIELDS) assert.ok(f in hit, f);
    assert.equal(hit.ref_host, null);
    assert.equal(hit.ip, null);
    assert.equal(hit.device, null);
    assert.equal(hit.path, "/");
  });

  test("anything but an object is refused", () => {
    for (const bad of [null, undefined, "x", 7, ["a"], true]) {
      assert.throws(() => parseSiteHit(bad), /body must be an object/, String(bad));
    }
  });

  test("a non-string field is refused, named", () => {
    assert.throws(() => parseSiteHit({ ...good, region: 12 }), /region must be a string/);
    assert.throws(() => parseSiteHit({ ...good, path: ["/"] }), /path must be a string/);
  });

  test("host is required and path must start with a slash", () => {
    assert.throws(() => parseSiteHit({ ...good, host: "" }), /host is required/);
    assert.throws(() => parseSiteHit({ ...good, host: null }), /host is required/);
    assert.throws(() => parseSiteHit({ ...good, path: "capabilities" }), /path must start with/);
    assert.throws(() => parseSiteHit({ ...good, path: "" }), /path must start with/);
  });

  test("over-long fields are refused, except the user agent, which is truncated", () => {
    assert.throws(() => parseSiteHit({ ...good, path: "/" + "a".repeat(200) }), /path is too long/);
    assert.throws(() => parseSiteHit({ ...good, region: "ALAB" }), /region is too long/);
    const hit = parseSiteHit({ ...good, ua: "x".repeat(UA_MAX + 40) });
    assert.equal(hit.ua.length, UA_MAX);
  });

  test("a validation error carries the 400 the route answers with", () => {
    try {
      parseSiteHit({});
      assert.fail("should have thrown");
    } catch (err) {
      assert.equal(err.type, "validation");
      assert.equal(err.statusCode, 400);
    }
  });
});
