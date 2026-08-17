import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isTokenValid,
  adoptRefreshedToken,
  tokenExp,
  hasCompleteSession,
} from "./auth";

// Build a JWT-shaped token (header.payload.signature) with a base64url payload.
const mk = (payload: object): string => {
  const b64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `h.${b64}.s`;
};

// These tests run in vitest's node environment, so stub the one browser API
// auth.ts touches. Keeps the session rules testable without pulling in jsdom.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("isTokenValid", () => {
  const now = Math.floor(Date.parse("2026-07-16T12:00:00Z") / 1000);

  it("accepts a token whose exp is still in the future", () => {
    expect(isTokenValid(mk({ exp: now + 3600 }))).toBe(true);
  });

  it("rejects an expired token", () => {
    expect(isTokenValid(mk({ exp: now - 1 }))).toBe(false);
  });

  it("rejects null, empty, garbage, and exp-less tokens", () => {
    expect(isTokenValid(null)).toBe(false);
    expect(isTokenValid("")).toBe(false);
    expect(isTokenValid("not-a-jwt")).toBe(false);
    expect(isTokenValid(mk({ user_id: "x" }))).toBe(false);
  });
});

describe("tokenExp", () => {
  it("reads exp, and returns null when it can't", () => {
    expect(tokenExp(mk({ exp: 123 }))).toBe(123);
    expect(tokenExp(null)).toBeNull();
    expect(tokenExp("garbage")).toBeNull();
    expect(tokenExp(mk({ exp: "soon" }))).toBeNull();
  });
});

describe("adoptRefreshedToken", () => {
  const now = Math.floor(Date.parse("2026-07-16T12:00:00Z") / 1000);
  const live = mk({ exp: now + 1800 });

  beforeEach(() => localStorage.clear());

  it("adopts a token that extends the session", () => {
    localStorage.setItem("token", live);
    const longer = mk({ exp: now + 3600 });

    expect(adoptRefreshedToken(longer)).toBe(true);
    expect(localStorage.getItem("token")).toBe(longer);
  });

  it("adopts when there is no current token", () => {
    const fresh = mk({ exp: now + 3600 });
    expect(adoptRefreshedToken(fresh)).toBe(true);
    expect(localStorage.getItem("token")).toBe(fresh);
  });

  // The bug: a response replayed from Chrome's HTTP cache carried an
  // X-Refreshed-Token minted hours earlier. Storing it logged the user out.
  it("ignores an expired token replayed from a cached response", () => {
    localStorage.setItem("token", live);
    const stale = mk({ exp: now - 7200 });

    expect(adoptRefreshedToken(stale)).toBe(false);
    expect(localStorage.getItem("token")).toBe(live);
  });

  it("ignores a still-valid token that is older than the one we hold", () => {
    localStorage.setItem("token", live);
    const older = mk({ exp: now + 60 });

    expect(adoptRefreshedToken(older)).toBe(false);
    expect(localStorage.getItem("token")).toBe(live);
  });

  it("ignores an unreadable token", () => {
    localStorage.setItem("token", live);

    expect(adoptRefreshedToken("not-a-jwt")).toBe(false);
    expect(localStorage.getItem("token")).toBe(live);
  });
});

describe("hasCompleteSession — fail closed, never default-to-admin", () => {
  const put = (k: string, v: string) => localStorage.setItem(k, v);
  const freshToken = () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "");
    return `${b64({ alg: "HS256" })}.${b64({ exp })}.sig`;
  };
  beforeEach(() => localStorage.clear());

  it("true only when token + user_id + role are ALL present", () => {
    put("token", freshToken());
    put("user_id", "u1");
    put("role", "dispatcher");
    expect(hasCompleteSession()).toBe(true);
  });

  it("a valid token with missing identity is NOT a session (the chimera state)", () => {
    put("token", freshToken());
    expect(hasCompleteSession()).toBe(false);
    put("user_id", "u1"); // still no role
    expect(hasCompleteSession()).toBe(false);
  });

  it("identity without a live token is not a session either", () => {
    put("user_id", "u1");
    put("role", "admin");
    expect(hasCompleteSession()).toBe(false);
  });
});
