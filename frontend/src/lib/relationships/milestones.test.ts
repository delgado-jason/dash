import { describe, it, expect } from "vitest";
import {
  deliveredInOrder,
  firstLoadKey,
  liveAnniversary,
  milestoneFlags,
  milestoneFlagsFor,
  milestoneMarker,
  ordinal,
  streakOf,
  streakVerdict,
  type MilestoneLoadLike,
} from "./milestones";

const NOW = new Date("2026-09-12T15:00:00Z");
const A = { agent_id: "a" };

// n delivered loads for the agent, one a week ending on `last`.
const loadsFor = (agentId: string, n: number, last = "2026-08-31", extra: Partial<MilestoneLoadLike> = {}): MilestoneLoadLike[] => {
  const out: MilestoneLoadLike[] = [];
  const end = Date.parse(`${last}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    const day = new Date(end - (n - 1 - i) * 7 * 86_400_000).toISOString().slice(0, 10);
    out.push({ agent_id: agentId, load_status: "delivered", load_number: `L${i + 1}`, pickup_date: day, delivery_date: day, ...extra });
  }
  return out;
};

// A load graded on time at both stops (a set appointment, arrived before it).
const onTime: Partial<MilestoneLoadLike> = { pickup_appt_start: "08:00:00", shipper_in: "07:45:00", delivery_appt_start: "14:00:00", receiver_in: "13:30:00" };
const late: Partial<MilestoneLoadLike> = { ...onTime, receiver_in: "14:30:00" };

describe("deliveredInOrder — oldest first, delivered only", () => {
  it("skips other agents and non-delivered loads; orders by delivery day", () => {
    const loads: MilestoneLoadLike[] = [
      { agent_id: "a", load_status: "delivered", load_number: "2", delivery_date: "2026-09-02T05:00:00.000Z" },
      { agent_id: "a", load_status: "booked", load_number: "x", pickup_date: "2026-09-20" },
      { agent_id: "b", load_status: "delivered", load_number: "y", delivery_date: "2026-09-01" },
      { agent_id: "a", load_status: "delivered", load_number: "1", delivery_date: "2026-09-01" },
    ];
    expect(deliveredInOrder(loads, "a").map((l) => l.load_number)).toEqual(["1", "2"]);
    expect(deliveredInOrder([], "a")).toEqual([]);
  });
});

describe("milestone flags — load count crossings", () => {
  it("nothing under five loads", () => {
    expect(milestoneFlagsFor(A, loadsFor("a", 4), [], [], NOW)).toEqual([]);
  });

  it("five loads → one open flag with the crossing day and the marker", () => {
    const flags = milestoneFlagsFor(A, loadsFor("a", 5, "2026-08-31"), [], [], NOW);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ kind: "loads", n: 5, marker: "[milestone:loads-5]", crossedOn: "2026-08-31", label: "5 loads" });
  });

  it("only the HIGHEST crossed threshold is offered — twelve loads flags the 10th, not the 5th", () => {
    const flags = milestoneFlagsFor(A, loadsFor("a", 12), [], [], NOW);
    expect(flags.map((f) => f.n)).toEqual([10]);
  });

  it("a sent marker (prefix or folded) or a skipped agent note closes it", () => {
    const loads = loadsFor("a", 5);
    expect(milestoneFlagsFor(A, loads, [{ agent_id: "a", note: "[milestone:loads-5] emailed" }], [], NOW)).toEqual([]);
    expect(milestoneFlagsFor(A, loads, [{ agent_id: "a", note: "capacity list · [milestone:loads-5]" }], [], NOW)).toEqual([]);
    expect(milestoneFlagsFor(A, loads, [], [{ agent_id: "a", note: "[milestone:loads-5:skipped]" }], NOW)).toEqual([]);
    // another agent's marker is not this agent's
    expect(milestoneFlagsFor(A, loads, [{ agent_id: "b", note: "[milestone:loads-5]" }], [], NOW)).toHaveLength(1);
  });

  it("milestoneMarker / ordinal spell the SOP's tokens and words", () => {
    expect(milestoneMarker("streak", 20)).toBe("[milestone:streak-20]");
    expect([1, 2, 3, 4, 5, 10, 11, 12, 13, 21, 22, 25, 100].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "5th", "10th", "11th", "12th", "13th", "21st", "22nd", "25th", "100th"]);
  });
});

describe("the streak — consecutive on-time, claim-free loads; untimed loads neutral", () => {
  it("streakVerdict grades one load", () => {
    expect(streakVerdict({ load_status: "delivered" })).toBe("neutral");
    expect(streakVerdict({ load_status: "delivered", ...onTime })).toBe("counts");
    expect(streakVerdict({ load_status: "delivered", ...late })).toBe("breaks");
    expect(streakVerdict({ load_status: "delivered", ...onTime, claim_filed: true })).toBe("breaks");
    // a claim breaks it even with nothing timed
    expect(streakVerdict({ load_status: "delivered", claim_filed: true })).toBe("breaks");
    // early inside a window ("waited") is not late
    expect(streakVerdict({ load_status: "delivered", pickup_appt_start: "08:00:00", pickup_appt_end: "10:00:00", shipper_in: "07:00:00" })).toBe("counts");
  });

  it("counts the current run from the newest load back to the first breaker, skipping neutral loads", () => {
    const loads = [
      ...loadsFor("a", 3, "2026-06-01", onTime), // old run of 3
      ...loadsFor("a", 1, "2026-06-15", late), // breaker
      ...loadsFor("a", 2, "2026-07-15", onTime), // 2 count
      ...loadsFor("a", 3, "2026-08-10"), // 3 neutral — untimed
      ...loadsFor("a", 1, "2026-08-31", onTime), // 1 counts
    ].map((l, i) => ({ ...l, load_number: `L${i}` }));
    expect(streakOf(loads, "a").n).toBe(3);
    expect(streakOf([], "a").n).toBe(0);
  });

  it("a streak of ten flags the 10th with the day the run reached it", () => {
    const loads = loadsFor("a", 11, "2026-08-31", onTime);
    const flags = milestoneFlagsFor(A, loads, [], [], NOW);
    const streak = flags.find((f) => f.kind === "streak");
    expect(streak).toMatchObject({ n: 10, marker: "[milestone:streak-10]", label: "10 straight" });
    // the 10th counted load, oldest first, delivered a week before the last
    expect(streak?.crossedOn).toBe("2026-08-24");
    // eleven loads also crossed the 10-load count milestone
    expect(flags.find((f) => f.kind === "loads")?.n).toBe(10);
  });
});

describe("the anniversary — the first load's day, for 14 days, once a year", () => {
  it("firstLoadKey is the earliest delivered load's pickup day", () => {
    expect(firstLoadKey(loadsFor("a", 3, "2026-08-31"), "a")).toBe("2026-08-17");
    expect(firstLoadKey([], "a")).toBeNull();
  });

  it("liveAnniversary opens on the day and closes after 14 days; the first year is not one", () => {
    expect(liveAnniversary("2025-09-10", new Date("2026-09-09T12:00:00Z"))).toBeNull();
    expect(liveAnniversary("2025-09-10", new Date("2026-09-10T12:00:00Z"))).toEqual({ year: 2026, day: "2026-09-10" });
    expect(liveAnniversary("2025-09-10", new Date("2026-09-23T12:00:00Z"))).toEqual({ year: 2026, day: "2026-09-10" });
    expect(liveAnniversary("2025-09-10", new Date("2026-09-24T12:00:00Z"))).toBeNull();
    expect(liveAnniversary("2026-09-10", new Date("2026-09-10T12:00:00Z"))).toBeNull();
  });

  it("a December anniversary still shows in early January — the previous year's window", () => {
    expect(liveAnniversary("2024-12-28", new Date("2026-01-05T12:00:00Z"))).toEqual({ year: 2025, day: "2025-12-28" });
  });

  it("the window is counted in LOCAL days, like the holidays — 9pm Central is already tomorrow in UTC", () => {
    // Anniversary 2026-09-10; the window's last day is Sep 23. At 9pm local on
    // Sep 23 it is 02:00Z Sep 24 — a UTC key would have closed the flag early.
    expect(liveAnniversary("2025-09-10", new Date(2026, 8, 23, 21))).toEqual({ year: 2026, day: "2026-09-10" });
    // And the evening before it opens: 9pm Sep 9 local is Sep 10 in UTC — still closed.
    expect(liveAnniversary("2025-09-10", new Date(2026, 8, 9, 21))).toBeNull();
  });

  it("flags with the year marker and a years label; a sent marker closes it", () => {
    const loads = loadsFor("a", 1, "2025-09-05"); // first load 2025-09-05 → anniversary 2026-09-05, NOW = Sep 12 → day 7
    const [flag] = milestoneFlagsFor(A, loads, [], [], NOW);
    expect(flag).toMatchObject({ kind: "anniversary", n: 2026, marker: "[milestone:anniversary-2026]", crossedOn: "2026-09-05", label: "1 year" });
    expect(milestoneFlagsFor(A, loads, [{ agent_id: "a", note: "[milestone:anniversary-2026] sent" }], [], NOW)).toEqual([]);
  });
});

describe("milestoneFlags — the whole active book", () => {
  it("flattens per-agent flags in the caller's order and skips agents with nothing open", () => {
    const loads = [...loadsFor("a", 5), ...loadsFor("b", 2), ...loadsFor("c", 10)];
    const flags = milestoneFlags([{ agent_id: "c" }, { agent_id: "b" }, { agent_id: "a" }], loads, [], [], NOW);
    expect(flags.map((f) => `${f.agent.agent_id}:${f.n}`)).toEqual(["c:10", "a:5"]);
    expect(milestoneFlags([], loads, [], [], NOW)).toEqual([]);
  });
});
