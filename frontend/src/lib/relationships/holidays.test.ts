import { describe, it, expect } from "vitest";
import { activeHoliday, holidayFlags, holidayMarker, holidayWindows, thanksgivingOf } from "./holidays";

const local = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h, 0, 0);

describe("thanksgivingOf — the 4th Thursday of November", () => {
  it("lands on the right Thursday across years", () => {
    expect(thanksgivingOf(2026)).toBe("2026-11-26");
    expect(thanksgivingOf(2025)).toBe("2025-11-27");
    expect(thanksgivingOf(2027)).toBe("2027-11-25");
    expect(thanksgivingOf(2024)).toBe("2024-11-28");
  });
});

describe("holidayWindows / activeHoliday — 10 days before Thanksgiving, Dec 22 → Jan 2", () => {
  it("Thanksgiving 2026 shows from Nov 16 through the day", () => {
    const [tg, ny] = holidayWindows(2026);
    expect(tg).toEqual({ kind: "thanksgiving", year: 2026, day: "2026-11-26", start: "2026-11-16", end: "2026-11-26" });
    expect(ny).toEqual({ kind: "newyear", year: 2027, day: "2027-01-01", start: "2026-12-22", end: "2027-01-02" });
  });

  it("inside the windows → the window; outside → null", () => {
    expect(activeHoliday(local(2026, 11, 15))).toBeNull();
    expect(activeHoliday(local(2026, 11, 16))?.kind).toBe("thanksgiving");
    expect(activeHoliday(local(2026, 11, 26, 23))?.kind).toBe("thanksgiving");
    expect(activeHoliday(local(2026, 11, 27))).toBeNull();
    expect(activeHoliday(local(2026, 12, 21))).toBeNull();
    expect(activeHoliday(local(2026, 12, 22))?.kind).toBe("newyear");
    expect(activeHoliday(local(2027, 1, 2))?.year).toBe(2027); // early January belongs to the window that began in December
    expect(activeHoliday(local(2027, 1, 3))).toBeNull();
    expect(activeHoliday(local(2026, 9, 12))).toBeNull();
  });
});

describe("holidayFlags — one per active agent per holiday-year, closed by a marker", () => {
  const agents = [{ agent_id: "a" }, { agent_id: "b" }, { agent_id: "c" }];
  const inWindow = local(2026, 11, 20);

  it("outside a window nobody is flagged", () => {
    expect(holidayFlags(agents, [], [], local(2026, 10, 1))).toEqual([]);
  });

  it("inside the window every active agent is flagged with the year's marker", () => {
    const flags = holidayFlags(agents, [], [], inWindow);
    expect(flags.map((f) => f.agent.agent_id)).toEqual(["a", "b", "c"]);
    expect(flags[0]).toMatchObject({ kind: "thanksgiving", year: 2026, day: "2026-11-26", marker: "[holiday:thanksgiving-2026]" });
  });

  it("a sent marker in a contact note, a folded one, or a skipped agent note each close the flag", () => {
    const contacts = [
      { agent_id: "a", note: "[holiday:thanksgiving-2026] sent by email" },
      { agent_id: "b", note: "capacity list sent · [holiday:thanksgiving-2026]" },
    ];
    const notes = [{ agent_id: "c", note: "[holiday:thanksgiving-2026:skipped]" }];
    expect(holidayFlags(agents, contacts, notes, inWindow)).toEqual([]);
  });

  it("last year's marker does not close this year's flag", () => {
    const contacts = [{ agent_id: "a", note: "[holiday:thanksgiving-2025]" }];
    expect(holidayFlags([agents[0]], contacts, [], inWindow)).toHaveLength(1);
    expect(holidayMarker("newyear", 2027)).toBe("[holiday:newyear-2027]");
  });

  it("New Year: Dec 28 flags the year that begins, closed only by its own marker", () => {
    const dec28 = local(2026, 12, 28);
    const flags = holidayFlags(agents, [], [], dec28);
    expect(flags.map((f) => f.agent.agent_id)).toEqual(["a", "b", "c"]);
    expect(flags[0]).toMatchObject({ kind: "newyear", year: 2027, day: "2027-01-01", marker: "[holiday:newyear-2027]" });
    // this season's Thanksgiving marker, or last New Year's, leave it open
    expect(holidayFlags([agents[0]], [{ agent_id: "a", note: "[holiday:thanksgiving-2026] sent" }], [], dec28)).toHaveLength(1);
    expect(holidayFlags([agents[0]], [{ agent_id: "a", note: "[holiday:newyear-2026]" }], [], dec28)).toHaveLength(1);
    // its own marker — sent in a contact note, or skipped in an agent note — closes it
    expect(holidayFlags([agents[0]], [{ agent_id: "a", note: "[holiday:newyear-2027] sent" }], [], dec28)).toEqual([]);
    expect(holidayFlags([agents[0]], [], [{ agent_id: "a", note: "[holiday:newyear-2027:skipped]" }], dec28)).toEqual([]);
    // the same flag runs through Jan 2, then nothing
    expect(holidayFlags([agents[0]], [], [], local(2027, 1, 2))[0]?.marker).toBe("[holiday:newyear-2027]");
    expect(holidayFlags([agents[0]], [], [], local(2027, 1, 3))).toEqual([]);
  });

  it("an empty book flags nobody", () => {
    expect(holidayFlags([], [], [], inWindow)).toEqual([]);
  });
});
