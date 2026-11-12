import { describe, it, expect } from "vitest";
import {
  standingOf,
  standingPatch,
  standingLabel,
  standingIsContradictory,
  STANDING_OPTIONS,
  type Standing,
} from "./standing";

describe("standingOf — one value over two columns", () => {
  it("PARKED ALWAYS WINS, whatever stars the desk still carries", () => {
    // The whole point. Four of Jason's parked agents carry 3 stars — the same
    // default as 39 active ones — because nobody re-rates a desk they have
    // stopped calling. Reading the rating first is how "Because he's an
    // asshole" came to look like an ordinary middling agent.
    expect(standingOf({ rating: 3, work_status: "parked" })).toBe("parked");
    expect(standingOf({ rating: 5, work_status: "parked" })).toBe("parked");
    expect(standingOf({ rating: null, work_status: "parked" })).toBe("parked");
  });

  it("an active desk reads its stars", () => {
    for (const r of [1, 2, 3, 4, 5]) {
      expect(standingOf({ rating: r, work_status: "active" })).toBe(r);
    }
  });

  it("unrated is null, not a zero and not a default", () => {
    expect(standingOf({ rating: null, work_status: "active" })).toBeNull();
    expect(standingOf({})).toBeNull();
    expect(standingOf({ rating: 0 })).toBeNull();
    expect(standingOf({ rating: 7 })).toBeNull();
  });
});

describe("standingPatch — what to write", () => {
  const active3 = { rating: 3, work_status: "active" };
  const parked3 = { rating: 3, work_status: "parked" };

  it("PARKING DOES NOT TOUCH THE RATING — it is what you come back to", () => {
    const p = standingPatch(active3, "parked", "Because he's an asshole");
    expect(p).toEqual({ work_status: "parked", park_reason: "Because he's an asshole" });
    expect(p).not.toHaveProperty("rating");
  });

  it("un-parking restores the stored stars and clears the reason", () => {
    expect(standingPatch(parked3, 4)).toEqual({
      rating: 4,
      work_status: "active",
      park_reason: null,
    });
  });

  it("NO MIGRATION NEEDED: re-parking a 3-star parked agent is a no-op", () => {
    // The four 3-star parked agents simply read "Parked" from now on.
    expect(standingPatch(parked3, "parked")).toEqual({});
  });

  it("an ordinary re-rating does not write work_status on every agent", () => {
    expect(standingPatch(active3, 5)).toEqual({ rating: 5 });
  });

  it("no change is an empty patch, so a caller can tell a no-op from a write", () => {
    expect(standingPatch(active3, 3)).toEqual({});
    expect(Object.keys(standingPatch(active3, 3))).toHaveLength(0);
  });

  it("re-parking WITH a new reason does write, because the reason is the point", () => {
    expect(standingPatch(parked3, "parked", "Bad number now")).toEqual({
      work_status: "parked",
      park_reason: "Bad number now",
    });
  });

  it("a blank reason stores null, never an empty string", () => {
    expect(standingPatch(active3, "parked", "   ")).toEqual({
      work_status: "parked",
      park_reason: null,
    });
  });

  it("DRIFT IS IMPOSSIBLE: every move lands on the standing it was asked for", () => {
    const states: Array<{ rating: number | null; work_status: string }> = [
      { rating: null, work_status: "active" },
      { rating: 1, work_status: "active" },
      { rating: 3, work_status: "active" },
      { rating: 5, work_status: "active" },
      { rating: 3, work_status: "parked" },
      { rating: null, work_status: "parked" },
    ];
    const targets: Standing[] = ["parked", 1, 2, 3, 4, 5];
    for (const before of states) {
      for (const want of targets) {
        const after = { ...before, ...standingPatch(before, want, "reason") };
        expect(standingOf(after)).toBe(want);
      }
    }
  });
});

describe("the vocabulary", () => {
  it("parked sits at the BOTTOM of the scale, below 1 star", () => {
    expect(STANDING_OPTIONS.at(-1)!.value).toBe("parked");
    expect(STANDING_OPTIONS.at(0)!.value).toBe(5);
    expect(STANDING_OPTIONS).toHaveLength(6);
  });

  it("every option has a label, and an unknown standing is Unrated", () => {
    for (const o of STANDING_OPTIONS) expect(standingLabel(o.value)).toBe(o.label);
    expect(standingLabel(null)).toBe("Unrated");
  });
});

describe("standingIsContradictory", () => {
  it("flags BTN Zegar — rated Blacklist, still active", () => {
    expect(standingIsContradictory({ rating: 1, work_status: "active" })).toBe(true);
  });

  it("does not flag a parked blacklist, which is consistent", () => {
    expect(standingIsContradictory({ rating: 1, work_status: "parked" })).toBe(false);
  });

  it("does not flag anything else", () => {
    for (const r of [null, 2, 3, 4, 5]) {
      expect(standingIsContradictory({ rating: r, work_status: "active" })).toBe(false);
    }
  });
});
