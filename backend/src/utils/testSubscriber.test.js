import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isTestSubscriberAddress,
  TEST_ADDRESS_RE,
  TEST_ADDRESS_SQL_PATTERN,
} from "./testSubscriber.js";

describe("isTestSubscriberAddress", () => {
  test("flags the owner's plus-tagged test address", () => {
    assert.equal(isTestSubscriberAddress("jason+logbook-test@example.com"), true);
    assert.equal(isTestSubscriberAddress("Jason+Logbook-Test@Example.com"), true);
    assert.equal(isTestSubscriberAddress("jason+logbook-test2@example.com"), true);
  });

  test("does not flag a real reader, or the text after the @", () => {
    assert.equal(isTestSubscriberAddress("reader@example.com"), false);
    assert.equal(isTestSubscriberAddress("jason@logbook-test.com"), false);
    assert.equal(isTestSubscriberAddress("jason+logbook@example.com"), false);
    assert.equal(isTestSubscriberAddress(null), false);
  });

  test("the SQL spelling is the same rule as the JS one", () => {
    assert.equal(new RegExp(TEST_ADDRESS_SQL_PATTERN, "i").source, TEST_ADDRESS_RE.source);
  });
});
