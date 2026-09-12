import { describe, it, expect } from "vitest";
import { hasMarker, markersOf, skippedMarker } from "./markers";

describe("markers — the tokens that keep a flag down", () => {
  it("skippedMarker turns a marker into its skipped twin", () => {
    expect(skippedMarker("[milestone:loads-5]")).toBe("[milestone:loads-5:skipped]");
    expect(skippedMarker("[holiday:newyear-2027]")).toBe("[holiday:newyear-2027:skipped]");
  });

  it("markersOf reads contact notes and agent notes for ONE agent, wherever the token sits", () => {
    const contacts = [
      { agent_id: "a", note: "[milestone:loads-5] sent" },
      { agent_id: "a", note: "capacity · [holiday:thanksgiving-2026]" },
      { agent_id: "a", note: null },
      { agent_id: "b", note: "[milestone:loads-10]" },
    ];
    const notes = [{ agent_id: "a", note: "[milestone:streak-10:skipped]" }];
    expect([...markersOf("a", contacts, notes)].sort()).toEqual(["[holiday:thanksgiving-2026]", "[milestone:loads-5]", "[milestone:streak-10:skipped]"]);
    expect([...markersOf("b", contacts, notes)]).toEqual(["[milestone:loads-10]"]);
    expect(markersOf("c", contacts, notes).size).toBe(0);
  });

  it("hasMarker is true for the sent marker or its skipped twin, false otherwise", () => {
    const contacts = [{ agent_id: "a", note: "[milestone:loads-5] sent" }];
    const notes = [{ agent_id: "a", note: "[milestone:loads-10:skipped]" }];
    expect(hasMarker("a", "[milestone:loads-5]", contacts, notes)).toBe(true);
    expect(hasMarker("a", "[milestone:loads-10]", contacts, notes)).toBe(true);
    expect(hasMarker("a", "[milestone:loads-25]", contacts, notes)).toBe(false);
    expect(hasMarker("a", "[milestone:loads-5]", [], [])).toBe(false);
  });

  it("a near-miss token is not a marker", () => {
    const contacts = [{ agent_id: "a", note: "milestone:loads-5 without brackets · [milestone:loads-] · [milestone:loads-5x]" }];
    expect(markersOf("a", contacts, []).size).toBe(0);
  });
});
