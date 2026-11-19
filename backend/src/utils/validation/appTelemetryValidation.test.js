import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  pageOf,
  parseAppHit,
  parseAppError,
  clampDays,
  PATH_MAX,
  MESSAGE_MAX,
  STACK_MAX,
} from "./appTelemetryValidation.js";

describe("pageOf — the route family a path belongs to", () => {
  test("ids fold to a dot; plain words stay", () => {
    assert.equal(pageOf("/loads/9960798"), "/loads/·");
    assert.equal(pageOf("/loads/1377873"), "/loads/·");
    assert.equal(pageOf("/agents/c94e0784-e17b-4cf7-b402-b5ed5edd8740"), "/agents/·");
    assert.equal(pageOf("/agencies/CPL"), "/agencies/·");
    assert.equal(pageOf("/maintenance/report"), "/maintenance/report");
    assert.equal(pageOf("/loads/new"), "/loads/new");
    assert.equal(pageOf("/fuel-entries"), "/fuel-entries");
  });

  test("the query and the hash never count; the root is /", () => {
    assert.equal(pageOf("/loads/new?load_number=9960798"), "/loads/new");
    assert.equal(pageOf("/guide#the-plan"), "/guide");
    assert.equal(pageOf("/"), "/");
    assert.equal(pageOf(""), "/");
  });
});

describe("parseAppHit — a page opened", () => {
  test("a path becomes path + page", () => {
    assert.deepEqual(parseAppHit({ path: "/loads/9960798" }), {
      path: "/loads/9960798",
      page: "/loads/·",
    });
  });

  test("refusals: not an object, no path, a path that isn't one", () => {
    assert.throws(() => parseAppHit(null), /body must be an object/);
    assert.throws(() => parseAppHit({}), /path must start with/);
    assert.throws(() => parseAppHit({ path: "loads" }), /path must start with/);
    assert.throws(() => parseAppHit({ path: 7 }), /path must be a string/);
  });

  test("a long path is trimmed to the column, not refused", () => {
    const long = "/" + "a".repeat(PATH_MAX * 2);
    assert.equal(parseAppHit({ path: long }).path.length, PATH_MAX);
  });
});

describe("parseAppError — an error caught", () => {
  test("the full body passes, trimmed", () => {
    const e = parseAppError({
      message: "  Cannot read properties of undefined (reading 'gross')  ",
      stack: "TypeError: …\n    at LoadsPage",
      kind: "render",
      path: "/loads/9960798?x=1",
      app_version: "1.297.0",
      user_agent: "Mozilla/5.0",
    });
    assert.equal(e.message, "Cannot read properties of undefined (reading 'gross')");
    assert.equal(e.kind, "render");
    assert.equal(e.path, "/loads/9960798?x=1");
    assert.equal(e.page, "/loads/·");
    assert.equal(e.app_version, "1.297.0");
  });

  test("message is the one required field; an unknown kind reads as error; no path is /", () => {
    assert.throws(() => parseAppError({ stack: "x" }), /message is required/);
    assert.throws(() => parseAppError({ message: "   " }), /message is required/);
    const e = parseAppError({ message: "boom", kind: "weird" });
    assert.equal(e.kind, "error");
    assert.equal(e.path, "/");
    assert.equal(e.page, "/");
    assert.equal(e.stack, null);
  });

  test("a long message or stack is cut to the column, never refused", () => {
    const e = parseAppError({ message: "m".repeat(MESSAGE_MAX + 50), stack: "s".repeat(STACK_MAX + 50) });
    assert.equal(e.message.length, MESSAGE_MAX);
    assert.equal(e.stack.length, STACK_MAX);
  });
});

describe("clampDays — the ?days= on the reads", () => {
  test("whole days 1–365 pass; anything else is the fallback", () => {
    assert.equal(clampDays("30"), 30);
    assert.equal(clampDays(7), 7);
    assert.equal(clampDays("0"), 30);
    assert.equal(clampDays("366"), 30);
    assert.equal(clampDays("x"), 30);
    assert.equal(clampDays(undefined, 3), 3);
    assert.equal(clampDays("2.5"), 30);
  });
});
