import { describe, it, expect } from "vitest";
import { hometimeStatus } from "./hometime";

// today is passed in explicitly, so these tests never touch the real clock.
const today = new Date(2026, 6, 15); // 2026-07-15 (local), matches dayKey()

describe("hometimeStatus", () => {
  it("returns 'none' with null days when no home day is marked", () => {
    const h = hometimeStatus(null, 21, today);
    expect(h.state).toBe("none");
    expect(h.daysOut).toBeNull();
    expect(h.toTarget).toBeNull();
  });

  it("returns 'home' when the last home mark is today", () => {
    const h = hometimeStatus("2026-07-15", 21, today);
    expect(h.state).toBe("home");
    expect(h.daysOut).toBe(0);
    expect(h.toTarget).toBe(21);
  });

  it("returns 'ok' with days left when out but within threshold", () => {
    const h = hometimeStatus("2026-07-09", 21, today); // 6 days out
    expect(h.state).toBe("ok");
    expect(h.daysOut).toBe(6);
    expect(h.toTarget).toBe(15);
  });

  it("treats exactly the threshold as still 'ok' (0 to target)", () => {
    const h = hometimeStatus("2026-06-24", 21, today); // 21 days out
    expect(h.state).toBe("ok");
    expect(h.daysOut).toBe(21);
    expect(h.toTarget).toBe(0);
  });

  it("returns 'over' once past the threshold", () => {
    const h = hometimeStatus("2026-06-23", 21, today); // 22 days out
    expect(h.state).toBe("over");
    expect(h.daysOut).toBe(22);
    expect(h.toTarget).toBeNull();
  });

  it("clamps a future home mark to 0 days out", () => {
    const h = hometimeStatus("2026-07-20", 21, today); // planned home, future
    expect(h.state).toBe("home");
    expect(h.daysOut).toBe(0);
  });
});
