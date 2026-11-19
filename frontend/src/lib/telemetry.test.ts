import { describe, it, expect } from "vitest";
import { shouldSendHit, withinBudget, ignored, HIT_DEDUPE_MS, ERROR_BURST } from "./telemetry";

describe("shouldSendHit — one opening per path per two seconds", () => {
  it("the first hit, a different path, or the same path after the window all send", () => {
    expect(shouldSendHit("/loads", 1000, null)).toBe(true);
    expect(shouldSendHit("/loads", 1000, { path: "/trips", at: 900 })).toBe(true);
    expect(shouldSendHit("/loads", 1000 + HIT_DEDUPE_MS + 1, { path: "/loads", at: 1000 })).toBe(true);
  });

  it("the same path inside the window is one opening (StrictMode's double mount)", () => {
    expect(shouldSendHit("/loads", 1050, { path: "/loads", at: 1000 })).toBe(false);
    expect(shouldSendHit("/loads", 1000 + HIT_DEDUPE_MS, { path: "/loads", at: 1000 })).toBe(false);
  });
});

describe("withinBudget — ten error reports a minute", () => {
  it("counts only the sends still inside the window", () => {
    const now = 100_000;
    const old = now - ERROR_BURST.windowMs - 1;
    const r = withinBudget([old, now - 10, now - 20], now);
    expect(r.sent).toEqual([now - 10, now - 20]);
    expect(r.ok).toBe(true);
  });

  it("the eleventh in a minute does not fit; the first after the window does", () => {
    const now = 100_000;
    const ten = Array.from({ length: ERROR_BURST.max }, (_, i) => now - i);
    expect(withinBudget(ten, now).ok).toBe(false);
    expect(withinBudget(ten, now + ERROR_BURST.windowMs).ok).toBe(true);
  });

  it("an empty history fits", () => {
    expect(withinBudget([], 5)).toEqual({ ok: true, sent: [] });
  });
});

describe("ignored — browser noise that is not an error in dash", () => {
  it("drops the ResizeObserver loop message and keeps real errors", () => {
    expect(ignored("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(ignored("Cannot read properties of undefined (reading 'gross')")).toBe(false);
  });
});
