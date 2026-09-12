import { describe, it, expect } from "vitest";
import { allHandled, nextUnhandled, rotationIds } from "./callOrder";

const row = (id: string, recycle = false) => ({ agent: { agent_id: id }, recycle });

describe("callOrder — the advance walks this rotation, never the recycle fold", () => {
  it("rotationIds keeps list order and drops recycled rows; rows without the flag (prospects) all count", () => {
    expect(rotationIds([row("rec", true), row("a"), row("b"), row("rec2", true)])).toEqual(["a", "b"]);
    expect(rotationIds([{ agent: { agent_id: "p1" } }, { agent: { agent_id: "p2" } }])).toEqual(["p1", "p2"]);
    expect(rotationIds([])).toEqual([]);
  });

  it("a recycled agent is never next — even listed first, even once every graded row is handled", () => {
    const ids = rotationIds([row("rec", true), row("a"), row("b")]);
    expect(nextUnhandled(ids, new Set())).toBe("a");
    expect(nextUnhandled(ids, new Set(["a"]))).toBe("b");
    expect(nextUnhandled(ids, new Set(["a", "b"]))).toBeNull(); // not "rec"
    expect(nextUnhandled([], new Set())).toBeNull();
  });

  it("allHandled reads the rotation only — a recycled row left unhandled does not hold the list open; an empty rotation is not a worked list", () => {
    const ids = rotationIds([row("a"), row("rec", true)]);
    expect(allHandled(ids, new Set(["a"]))).toBe(true);
    expect(allHandled(ids, new Set())).toBe(false);
    expect(allHandled(rotationIds([row("rec", true)]), new Set())).toBe(false);
    expect(allHandled([], new Set())).toBe(false);
  });
});
