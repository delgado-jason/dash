import { describe, it, expect } from "vitest";
import { nameOf } from "./nameOf";

describe("nameOf", () => {
  it("trims and single-spaces: 'Jane  Doe ' → 'Jane Doe'", () => {
    expect(nameOf({ first_name: "Jane ", last_name: " Doe " })).toBe("Jane Doe");
    expect(nameOf({ first_name: "Jane", last_name: "  Van   Doe" })).toBe("Jane Van Doe");
  });
  it("a missing last name leaves no trailing space", () => {
    expect(nameOf({ first_name: "Jane", last_name: "" })).toBe("Jane");
  });
});
