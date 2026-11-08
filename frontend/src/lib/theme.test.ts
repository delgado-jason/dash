import { describe, it, expect } from "vitest";
import { parsePreference, resolveTheme, nextToggle, THEME_COLOR } from "./theme";

describe("theme · three preferences, two resolved looks", () => {
  it("a stored value is light or dark; anything else is system", () => {
    expect(parsePreference("light")).toBe("light");
    expect(parsePreference("dark")).toBe("dark");
    expect(parsePreference(null)).toBe("system");
    expect(parsePreference("")).toBe("system");
    expect(parsePreference("auto")).toBe("system");
  });

  it("system follows the device; light and dark hold", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("the one-tap toggle goes to the other look, as an explicit choice", () => {
    expect(nextToggle("dark")).toBe("light");
    expect(nextToggle("light")).toBe("dark");
  });

  it("the browser chrome colour matches the canvas of each look", () => {
    expect(THEME_COLOR.dark).toBe("#0b0f17");
    expect(THEME_COLOR.light).toBe("#f2f4f8");
  });
});
