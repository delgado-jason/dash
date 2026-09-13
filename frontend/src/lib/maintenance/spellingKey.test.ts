import { describe, it, expect } from "vitest";
import { spellingKey } from "./spellingKey";

describe("spellingKey — one shop, two spellings", () => {
  it("matches the real pair: Rays Tire Shop / Ray's Tire Service", () => {
    expect(spellingKey("Rays Tire Shop")).toBe("raystire");
    expect(spellingKey("Ray's Tire Service")).toBe("raystire");
    expect(spellingKey("Rays Tire Shop")).toBe(spellingKey("Ray's Tire Service"));
  });

  it("a one-word name keys on itself — TA is not TA Petro", () => {
    expect(spellingKey("TA")).toBe("ta");
    expect(spellingKey("TA Petro")).toBe("tapetro");
    expect(spellingKey("TA")).not.toBe(spellingKey("TA Petro"));
  });

  it("ignores case, punctuation and doubled spaces", () => {
    expect(spellingKey("THERMO  KING")).toBe(spellingKey("Thermo King"));
    expect(spellingKey("Thermo-King of Carlisle")).toBe("thermokingof");
  });

  it("two shops that differ in the first two words stay apart", () => {
    expect(spellingKey("Cummins Sales")).not.toBe(spellingKey("Cummins Atlantic"));
  });

  it("an empty name keys to empty, not a crash", () => {
    expect(spellingKey("")).toBe("");
    expect(spellingKey("   ")).toBe("");
  });
});
