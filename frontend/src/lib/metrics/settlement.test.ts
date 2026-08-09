import { describe, it, expect } from "vitest";
import { nextSettlementDate } from "./settlement";

// Date-only UTC math — no fake timers needed since the function takes `from`
// explicitly; fixed inputs keep these stable as the calendar advances.
const utc = (iso: string) => new Date(iso + "T00:00:00Z");

describe("nextSettlementDate", () => {
  it("finds the next Wednesday from a Sunday", () => {
    // 2026-08-09 is a Sunday; Wednesday = 3 → 2026-08-12.
    expect(nextSettlementDate(utc("2026-08-09"), 3).toISOString()).toBe(
      "2026-08-12T00:00:00.000Z",
    );
  });

  it("counts today when today IS the settlement day", () => {
    // 2026-08-12 is a Wednesday.
    expect(nextSettlementDate(utc("2026-08-12"), 3).toISOString()).toBe(
      "2026-08-12T00:00:00.000Z",
    );
  });

  it("wraps to next week the day after settlement", () => {
    // Thursday after a Wednesday settlement → the following Wednesday.
    expect(nextSettlementDate(utc("2026-08-13"), 3).toISOString()).toBe(
      "2026-08-19T00:00:00.000Z",
    );
  });

  it("handles every day-of-week value", () => {
    // From Sunday 2026-08-09: Sunday=today, Saturday=+6.
    expect(nextSettlementDate(utc("2026-08-09"), 0).getUTCDate()).toBe(9);
    expect(nextSettlementDate(utc("2026-08-09"), 6).getUTCDate()).toBe(15);
  });

  it("crosses a month boundary", () => {
    // Monday 2026-08-31 → Wednesday 2026-09-02.
    expect(nextSettlementDate(utc("2026-08-31"), 3).toISOString()).toBe(
      "2026-09-02T00:00:00.000Z",
    );
  });
});
