import { describe, it, expect } from "vitest";
import { formatPhone } from "./phone";

describe("formatPhone", () => {
  it("formats a 10-digit number to the US standard", () => {
    expect(formatPhone("9565550142")).toBe("(956) 555-0142");
  });

  it("is idempotent on an already-formatted number", () => {
    expect(formatPhone("(956) 555-0142")).toBe("(956) 555-0142");
  });

  it("drops a leading US country code", () => {
    expect(formatPhone("19565550142")).toBe("(956) 555-0142");
    expect(formatPhone("+1 956 555 0142")).toBe("(956) 555-0142");
  });

  it("formats progressively as digits are typed", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("956")).toBe("(956");
    expect(formatPhone("9565")).toBe("(956) 5");
    expect(formatPhone("956555")).toBe("(956) 555");
    expect(formatPhone("9565550")).toBe("(956) 555-0");
  });

  it("keeps extra digits as an extension rather than mangling them", () => {
    expect(formatPhone("956555014299")).toBe("(956) 555-0142 x99");
  });
});
