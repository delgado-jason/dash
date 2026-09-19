import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseSiteSubscriber,
  DEFAULT_SOURCE_PATH,
} from "./siteSubscriberValidation.js";

const good = {
  host: "delgadotruckingservices.com",
  email: "driver@example.com",
  source_path: "/logbook/the-load-that-paid-for-itself",
  consent_version: "2026-09-18",
};

describe("parseSiteSubscriber — the signup body", () => {
  test("a full body passes through as four known strings", () => {
    assert.deepEqual(parseSiteSubscriber(good), good);
  });

  test("anything but an object is refused", () => {
    for (const bad of [null, undefined, "x", 7, ["a"], true]) {
      assert.throws(
        () => parseSiteSubscriber(bad),
        /body must be an object/,
        String(bad),
      );
    }
  });

  test("host is required — missing, empty or not a string", () => {
    assert.throws(() => parseSiteSubscriber({ ...good, host: undefined }), /host is required/);
    assert.throws(() => parseSiteSubscriber({ ...good, host: "" }), /host is required/);
    assert.throws(() => parseSiteSubscriber({ ...good, host: "   " }), /host is required/);
    assert.throws(() => parseSiteSubscriber({ ...good, host: 7 }), /host is required/);
  });

  test("email is required, and must be a string", () => {
    assert.throws(() => parseSiteSubscriber({ ...good, email: undefined }), /email is required/);
    assert.throws(() => parseSiteSubscriber({ ...good, email: null }), /email is required/);
    assert.throws(() => parseSiteSubscriber({ ...good, email: ["a@b.co"] }), /email is required/);
  });

  test("consent_version is required — we have to know what they agreed to", () => {
    assert.throws(
      () => parseSiteSubscriber({ ...good, consent_version: undefined }),
      /consent_version is required/,
    );
    assert.throws(
      () => parseSiteSubscriber({ ...good, consent_version: "" }),
      /consent_version is required/,
    );
    assert.throws(
      () => parseSiteSubscriber({ ...good, consent_version: 1 }),
      /consent_version is required/,
    );
  });

  test("an address longer than 254 characters is refused", () => {
    const long = `${"a".repeat(250)}@example.com`;
    assert.throws(() => parseSiteSubscriber({ ...good, email: long }), /email is too long/);
  });

  test("whitespace inside the address is named for what it is", () => {
    assert.throws(
      () => parseSiteSubscriber({ ...good, email: "driver name@example.com" }),
      /email must not contain spaces/,
    );
    assert.throws(
      () => parseSiteSubscriber({ ...good, email: "driver@exa\tmple.com" }),
      /email must not contain spaces/,
    );
  });

  test("a shape that could never be an address is refused", () => {
    for (const bad of [
      "",
      "driver",
      "driver@",
      "@example.com",
      "driver@example",
      "driver@example.c",
      "a@b@example.com",
    ]) {
      assert.throws(
        () => parseSiteSubscriber({ ...good, email: bad }),
        /email is not a valid address/,
        bad,
      );
    }
  });

  test("the address is trimmed at the edges", () => {
    const sub = parseSiteSubscriber({ ...good, email: "  driver@example.com  " });
    assert.equal(sub.email, "driver@example.com");
  });

  test("an uppercase address is kept exactly as typed", () => {
    const typed = "Driver.Name@Example.COM";
    const sub = parseSiteSubscriber({ ...good, email: typed });
    assert.equal(sub.email, typed);
  });

  test("a consent version longer than 40 characters is refused", () => {
    assert.throws(
      () => parseSiteSubscriber({ ...good, consent_version: "v".repeat(41) }),
      /consent_version is too long/,
    );
  });

  test("no source_path falls back to the Logbook", () => {
    const { source_path: _omitted, ...withoutPath } = good;
    assert.equal(parseSiteSubscriber(withoutPath).source_path, DEFAULT_SOURCE_PATH);
    assert.equal(
      parseSiteSubscriber({ ...good, source_path: null }).source_path,
      DEFAULT_SOURCE_PATH,
    );
  });

  test("a source_path that is present but wrong is refused", () => {
    assert.throws(
      () => parseSiteSubscriber({ ...good, source_path: "logbook/entry-1" }),
      /source_path must start with/,
    );
    assert.throws(
      () => parseSiteSubscriber({
        ...good,
        source_path: "https://delgadotruckingservices.com/logbook",
      }),
      /source_path must start with/,
    );
    assert.throws(
      () => parseSiteSubscriber({ ...good, source_path: 7 }),
      /source_path must start with/,
    );
    assert.throws(
      () => parseSiteSubscriber({ ...good, source_path: `/${"a".repeat(200)}` }),
      /source_path is too long/,
    );
  });

  test("a validation error carries the 400 the route answers with", () => {
    try {
      parseSiteSubscriber({});
      assert.fail("should have thrown");
    } catch (err) {
      assert.equal(err.type, "validation");
      assert.equal(err.statusCode, 400);
    }
  });
});
