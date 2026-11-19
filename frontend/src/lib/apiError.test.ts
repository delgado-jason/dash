import { describe, it, expect } from "vitest";
import { apiErrorWord } from "./apiError";

describe("apiErrorWord — the sentence a failed request carries", () => {
  it("reads the server's sentence off the response body", () => {
    const err = { response: { data: { error: "The current password is wrong." } } };
    expect(apiErrorWord(err, "fallback")).toBe("The current password is wrong.");
  });

  it("falls back when there is no body, no sentence, or a blank one", () => {
    expect(apiErrorWord(new Error("Network Error"), "Could not reach dash.")).toBe(
      "Could not reach dash.",
    );
    expect(apiErrorWord({ response: { data: {} } }, "fb")).toBe("fb");
    expect(apiErrorWord({ response: { data: { error: "   " } } }, "fb")).toBe("fb");
    expect(apiErrorWord({ response: { data: { error: 500 } } }, "fb")).toBe("fb");
    expect(apiErrorWord(null, "fb")).toBe("fb");
    expect(apiErrorWord(undefined, "fb")).toBe("fb");
  });
});
