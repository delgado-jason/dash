import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isTokenValid } from "./auth";

// Build a JWT-shaped token (header.payload.signature) with a base64url payload.
const mk = (payload: object): string => {
  const b64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `h.${b64}.s`;
};

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
