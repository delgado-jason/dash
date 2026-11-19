import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resettableByOwner,
  assertOwnPasswordChange,
} from "./userServices.js";

// No database is touched: both guards are pure, and pg's Pool opens no
// connection until something queries it.

const OWNER = "a0000000-0000-0000-0000-000000000001";
const OTHER_OWNER = "a0000000-0000-0000-0000-000000000009";

const brandie = {
  user_id: "b0000000-0000-0000-0000-000000000001",
  email: "b@example.com",
  role: "dispatcher",
  parent_user_id: OWNER,
  display_name: "Brandie",
};

const owner = {
  user_id: OWNER,
  email: "j@example.com",
  role: "admin",
  parent_user_id: null,
  display_name: "Jason",
};

const throwsStatus = (fn, statusCode, re) =>
  assert.throws(fn, (err) => {
    assert.equal(err.statusCode, statusCode);
    assert.match(err.message, re);
    return true;
  });

describe("resettableByOwner — whose password the owner may set", () => {
  test("a dispatcher of this account passes through untouched", () => {
    assert.equal(resettableByOwner(brandie, OWNER), brandie);
  });

  test("the owner's own row is a 403 with a pointer to the right door", () => {
    throwsStatus(() => resettableByOwner(owner, OWNER), 403, /Settings → Your password/);
  });

  test("no row, and another account's dispatcher, are the same 404 sentence", () => {
    const sentence = /No dispatcher with that id on your account\./;
    throwsStatus(() => resettableByOwner(null, OWNER), 404, sentence);
    throwsStatus(() => resettableByOwner(undefined, OWNER), 404, sentence);
    throwsStatus(() => resettableByOwner(brandie, OTHER_OWNER), 404, sentence);
  });

  test("a row under this account that is not a dispatcher is refused", () => {
    const oddAdmin = { ...brandie, role: "admin" };
    throwsStatus(() => resettableByOwner(oddAdmin, OWNER), 403, /Only a dispatcher's password/);
  });
});

describe("assertOwnPasswordChange — the shape check before the database", () => {
  test("a missing current password is named first", () => {
    for (const bad of [undefined, null, "", 7]) {
      throwsStatus(() => assertOwnPasswordChange(bad, "long enough now"), 400, /Type your current password\./);
    }
  });

  test("the new one must meet the rule", () => {
    throwsStatus(() => assertOwnPasswordChange("old one here", "short"), 400, /at least 10 characters/);
    throwsStatus(() => assertOwnPasswordChange("old one here", ""), 400, /A password is required\./);
  });

  test("the same password twice is refused", () => {
    throwsStatus(
      () => assertOwnPasswordChange("same password", "same password"),
      400,
      /same as the current one/,
    );
  });

  test("a real change passes", () => {
    assert.doesNotThrow(() => assertOwnPasswordChange("old one here", "new one here"));
  });
});
