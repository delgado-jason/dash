import { describe, it, expect } from "vitest";
import { PER_DAY_TONE_VAR, type PerDayTone } from "@/lib/metrics/perDay";
import { perDayTextClass } from "./rpmStyle";

// The $/day colour is declared ONCE, in perDay.ts, as a theme token. This is
// the only place that respells it as a Tailwind utility, so if the spelling
// ever drifts the cells would silently lose their colour — nothing throws, the
// number just goes plain. Pin it.
describe("perDayTextClass", () => {
  it("spells each tone's token as its utility class", () => {
    expect(perDayTextClass("good")).toBe("text-status-positive-text");
    expect(perDayTextClass("warn")).toBe("text-status-aware-text");
    expect(perDayTextClass("bad")).toBe("text-status-negative-text");
  });

  it("covers every tone on the list — no tone can go unpainted", () => {
    for (const tone of Object.keys(PER_DAY_TONE_VAR) as PerDayTone[]) {
      expect(perDayTextClass(tone)).toBe(
        `text-${PER_DAY_TONE_VAR[tone].slice("var(--color-".length, -1)}`,
      );
    }
  });

  it("no verdict is no colour — it inherits, it does not grey out", () => {
    // Grey would say "thin data" about a figure that may be perfectly solid
    // and simply has no daily target to be judged against. The under-the-bar
    // grey belongs to the caller (LanesTable), not here.
    expect(perDayTextClass(null)).toBe("");
  });
});
