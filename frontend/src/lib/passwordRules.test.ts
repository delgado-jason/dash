import { describe, it, expect } from "vitest";
import {
  passwordProblem,
  PASSWORD_HINT,
  PASSWORD_MIN,
  PASSWORD_MAX,
} from "./passwordRules";

describe("passwordProblem — the client's copy of the server's rule", () => {
  it("ten characters pass; nine are named", () => {
    expect(passwordProblem("a".repeat(PASSWORD_MIN))).toBeNull();
    expect(passwordProblem("a".repeat(PASSWORD_MIN - 1))).toBe(
      "A password needs at least 10 characters.",
    );
  });

  it("empty is 'required', not 'too short'", () => {
    expect(passwordProblem("")).toBe("A password is required.");
  });

  it("the ceiling is 72 bytes, counted the way bcrypt counts", () => {
    expect(passwordProblem("a".repeat(PASSWORD_MAX))).toBeNull();
    expect(passwordProblem("a".repeat(PASSWORD_MAX + 1))).toBe(
      "A password can be at most 72 characters.",
    );
    expect(passwordProblem("é".repeat(36))).toBeNull();
    expect(passwordProblem("é".repeat(37))).toMatch(/at most 72/);
  });

  it("no composition rule", () => {
    expect(passwordProblem("the truck is blue")).toBeNull();
    expect(passwordProblem("0123456789")).toBeNull();
  });

  it("the hint names the minimum", () => {
    expect(PASSWORD_HINT).toBe("at least 10 characters");
  });
});
