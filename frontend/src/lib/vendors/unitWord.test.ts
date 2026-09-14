import { describe, it, expect } from "vitest";
import { unitWord } from "./unitWord";

describe("unitWord — what this stop worked on, when there's one answer", () => {
  it("each unit says its own word", () => {
    expect(unitWord(["tractor"])).toBe("truck");
    expect(unitWord(["trailer"])).toBe("trailer");
    expect(unitWord(["both"])).toBe("both");
    expect(unitWord(["apu"])).toBe("apu");
  });

  it("repeats of one unit are still one answer", () => {
    expect(unitWord(["tractor", "tractor", "tractor"])).toBe("truck");
  });

  it("two different units say nothing — one word can't carry it", () => {
    expect(unitWord(["tractor", "trailer"])).toBeNull();
    expect(unitWord(["apu", "both"])).toBeNull();
  });

  it("no units at all is null, not a crash", () => {
    expect(unitWord([])).toBeNull();
  });

  it("a unit the mock has no word for is null, not the raw value", () => {
    expect(unitWord(["forklift"])).toBeNull();
  });
});
