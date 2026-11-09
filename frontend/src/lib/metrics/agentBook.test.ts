import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import { agencyRange } from "@/lib/agencies/agencyMetrics";
import {
  agentBook,
  bookShape,
  goneQuiet,
  workingWith,
  QUIET_DAYS,
} from "./agentBook";

// The test env pins TZ to America/Chicago — the account's own clock.
const NOW = new Date("2026-08-01T12:00:00Z");
const RANGE = agencyRange("12m", NOW); // 2025-08-01 … 2026-08-01, on PICKUP

const mk = (over: Partial<Load>): Load =>
  ({
    load_id: Math.random().toString(36).slice(2),
    load_status: "delivered",
    agent_id: "A",
    pickup_date: "2026-06-01",
    delivery_date: "2026-06-03",
    loaded_miles: 1000,
    linehaul: "3000",
    fuel_surcharge: "0",
    total_accessorials: "0",
    ...over,
  }) as unknown as Load;

// A · three loads at $3.00, last picked up 12 days ago   → the repeat desk
// B · two loads at $5.00, last picked up 162 days ago    → the quiet relationship
// C · one load, 7 days ago                               → a stranger, recent
// D · one load, 208 days ago                             → a stranger, long gone
const BOOK: Load[] = [
  mk({ agent_id: "A", pickup_date: "2026-01-10", linehaul: "3000" }),
  mk({ agent_id: "A", pickup_date: "2026-03-10", linehaul: "3000" }),
  mk({ agent_id: "A", pickup_date: "2026-07-20", linehaul: "3000" }),
  mk({ agent_id: "B", pickup_date: "2026-02-01", linehaul: "5000" }),
  mk({ agent_id: "B", pickup_date: "2026-02-20", linehaul: "5000" }),
  mk({ agent_id: "C", pickup_date: "2026-07-25", linehaul: "1000" }),
  mk({ agent_id: "D", pickup_date: "2026-01-05", linehaul: "2000" }),
];

describe("agentBook", () => {
  const rows = agentBook(BOOK, RANGE, NOW);
  const row = (id: string) => rows.find((r) => r.agentId === id)!;

  it("rolls each desk up over the window, richest first", () => {
    expect(rows.map((r) => r.agentId)).toEqual(["B", "A", "D", "C"]);
    expect(row("A").loads).toBe(3);
    expect(row("A").gross).toBeCloseTo(9000, 5);
    expect(row("B").gross).toBeCloseTo(10000, 5);
  });

  it("takes the typical rate as the MEDIAN of the per-load rates", () => {
    expect(row("A").medianRpm).toBeCloseTo(3, 5);
    expect(row("B").medianRpm).toBeCloseTo(5, 5);
  });

  it("counts the days since the desk last GAVE you freight, off the pickup", () => {
    expect(row("A").lastWorked).toBe("2026-07-20");
    expect(row("A").daysSince).toBe(12);
    expect(row("B").daysSince).toBe(162);
    expect(row("D").daysSince).toBe(208);
  });

  it("leaves out a load outside the window and a load no desk owns", () => {
    const rs = agentBook(
      [
        ...BOOK,
        mk({ agent_id: "E", pickup_date: "2025-07-01" }), // before the window
        mk({ agent_id: null as unknown as string, pickup_date: "2026-07-01" }),
      ],
      RANGE,
      NOW,
    );
    expect(rs.find((r) => r.agentId === "E")).toBeUndefined();
    expect(rs).toHaveLength(4);
  });

  it("is null, never 0, for a desk whose loads have no miles", () => {
    const [r] = agentBook([mk({ agent_id: "Z", loaded_miles: 0 })], RANGE, NOW);
    expect(r.gross).toBeCloseTo(3000, 5);
    expect(r.medianRpm).toBeNull();
  });
});

describe("bookShape", () => {
  const shape = bookShape(agentBook(BOOK, RANGE, NOW));

  it("splits the money by how often a desk came back", () => {
    expect(shape.desks).toBe(4);
    expect(shape.gross).toBeCloseTo(22000, 5);
    expect(shape.once.desks).toBe(2); // C and D
    expect(shape.once.gross).toBeCloseTo(3000, 5);
    expect(shape.twice.desks).toBe(1); // B
    expect(shape.twice.gross).toBeCloseTo(10000, 5);
    expect(shape.repeat.desks).toBe(1); // A, three loads
    expect(shape.repeat.gross).toBeCloseTo(9000, 5);
  });

  it("counts the relationships — two loads or more", () => {
    expect(shape.repeatDesks).toBe(2); // A and B
  });

  it("shares are of the window's own gross and account for all of it", () => {
    const sum = shape.once.share + shape.twice.share + shape.repeat.share;
    expect(sum).toBeCloseTo(1, 10);
    expect(shape.once.share).toBeCloseTo(3000 / 22000, 10);
  });

  it("the adverse case: every desk a one-load desk", () => {
    const strangers = bookShape(
      agentBook(
        [
          mk({ agent_id: "P", pickup_date: "2026-03-01" }),
          mk({ agent_id: "Q", pickup_date: "2026-04-01" }),
          mk({ agent_id: "R", pickup_date: "2026-05-01" }),
        ],
        RANGE,
        NOW,
      ),
    );
    expect(strangers.once.desks).toBe(3);
    expect(strangers.once.share).toBeCloseTo(1, 10);
    // the repeat halves are honestly empty, never padded
    expect(strangers.twice.desks).toBe(0);
    expect(strangers.twice.gross).toBe(0);
    expect(strangers.repeat.desks).toBe(0);
    expect(strangers.repeatDesks).toBe(0);
  });

  it("an empty window is all zeroes, not a divide by zero", () => {
    const empty = bookShape([]);
    expect(empty.desks).toBe(0);
    expect(empty.gross).toBe(0);
    expect(empty.once.share).toBe(0);
    expect(empty.repeatDesks).toBe(0);
  });
});

describe("goneQuiet", () => {
  const rows = agentBook(BOOK, RANGE, NOW);

  it("lists only the desks that CAME BACK and then went silent", () => {
    const q = goneQuiet(rows);
    expect(q.map((r) => r.agentId)).toEqual(["B"]);
  });

  it("never lists a one-load desk, however long it has been", () => {
    // D has been silent 208 days — far past the band — but it ran one load, so
    // it is a stranger, not a lapsed relationship.
    expect(goneQuiet(rows).some((r) => r.agentId === "D")).toBe(false);
    expect(rows.find((r) => r.agentId === "D")!.daysSince).toBeGreaterThan(QUIET_DAYS);
  });

  it("never lists a repeat desk still inside the band", () => {
    // A is a repeat desk but ran 12 days ago.
    expect(goneQuiet(rows).some((r) => r.agentId === "A")).toBe(false);
  });

  it("orders by the money at risk", () => {
    const busy = agentBook(
      [
        ...BOOK,
        // a second quiet relationship, smaller than B
        mk({ agent_id: "F", pickup_date: "2026-01-02", linehaul: "1000" }),
        mk({ agent_id: "F", pickup_date: "2026-01-03", linehaul: "1000" }),
      ],
      RANGE,
      NOW,
    );
    expect(goneQuiet(busy).map((r) => r.agentId)).toEqual(["B", "F"]);
  });
});

describe("workingWith", () => {
  it("puts the most recent desk first", () => {
    const w = workingWith(agentBook(BOOK, RANGE, NOW));
    expect(w.map((r) => r.agentId)).toEqual(["C", "A", "B", "D"]);
  });
});
