import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import {
  reviewWindow, defaultReviewMonth, buildReview, reviewReportText,
} from "./monthlyReview";
import type { ContactLike, AgentLike } from "./relationships";
import type { GoToTier } from "./agentScorecard";

const NOW = new Date("2026-09-04T12:00:00Z");
const WIN = reviewWindow("2026-08", NOW); // quarter ending Aug 31
const TIERS = { minimum: 0.15, target: 0.25, strong: 0.35 };

const agent = (id: string, tier: number): AgentLike =>
  ({ agent_id: id, first_name: id, last_name: "X", relationship_tier: tier });

const load = (o: Partial<Load>): Load =>
  ({
    load_id: Math.random().toString(36).slice(2),
    agent_id: "a",
    load_status: "delivered",
    pickup_date: "2026-08-01",
    delivery_date: "2026-08-03",
    loaded_miles: 500,
    linehaul: "3000",
    net_revenue: "2400",
    ...o,
  }) as unknown as Load;

const touch = (o: Partial<ContactLike>): ContactLike =>
  ({
    agent_id: "a", contacted_at: "2026-08-10T10:00:00Z",
    direction: "outbound", method: "call", type: "check_in",
    ...o,
  });

const tiers = (m: Record<string, GoToTier>) => new Map(Object.entries(m));

describe("reviewWindow", () => {
  it("90 days ending on the month's last day; label carries the end date", () => {
    expect(WIN.endKey).toBe("2026-08-31");
    expect(WIN.startKey).toBe("2026-06-03");
    expect(WIN.label).toBe("QUARTER ENDING AUG 31 ’26");
  });
  it("the current month clamps to today — no judging unfinished days", () => {
    const w = reviewWindow("2026-09", NOW);
    expect(w.endKey).toBe("2026-09-04");
  });
  it("the default review month is the last COMPLETE one", () => {
    expect(defaultReviewMonth(NOW)).toBe("2026-08");
  });
});

describe("buildReview — the evidence rules, as printed", () => {
  it("HOLD for a T1 earning the seat (3+ loads, no drift)", () => {
    const loads = [1, 2, 3].map((i) => load({ load_id: `l${i}`, delivery_date: `2026-08-0${i}` }));
    const [r] = buildReview([agent("a", 1)], loads, [], tiers({ a: "solid" }), 3.0, TIERS, WIN, NOW);
    expect(r.move).toBe("hold");
    expect(r.loads90).toBe(3);
    expect(r.netRpm).toBeCloseTo(2400 * 3 / 1500, 5);
  });

  it("▲ needs 3+ loads AND data-tier above the seat", () => {
    const loads = [1, 2, 3].map((i) => load({ load_id: `l${i}`, delivery_date: `2026-08-0${i}` }));
    const [up] = buildReview([agent("a", 2)], loads, [], tiers({ a: "call-first" }), 3.0, TIERS, WIN, NOW);
    expect(up.move).toBe("up");
    // Two loads: same drift, under the bar → THIN, never a promotion.
    const [thin] = buildReview([agent("a", 2)], loads.slice(0, 2), [], tiers({ a: "call-first" }), 3.0, TIERS, WIN, NOW);
    expect(thin.move).toBe("thin");
  });

  it("▼ on a T1 needs the quarter quiet AND 60+ days cold; the why cites touches", () => {
    const loads = [load({ delivery_date: "2026-06-10" })]; // 1 load, 86d before NOW
    const contacts = Array.from({ length: 4 }, (_, i) =>
      touch({ contacted_at: `2026-08-0${i + 1}T10:00:00Z` }),
    );
    const [r] = buildReview([agent("a", 1)], loads, contacts, tiers({ a: "watch" }), 3.0, TIERS, WIN, NOW);
    expect(r.move).toBe("down");
    expect(r.why).toMatch(/86d cold/);
    expect(r.why).toMatch(/4 touches, 0 returned — you held up your end/);
  });

  it("a T1 with a recent load never gets the ▼ even at 1 load", () => {
    const loads = [load({ delivery_date: "2026-08-25" })]; // 10d before NOW
    const [r] = buildReview([agent("a", 1)], loads, [], tiers({ a: "watch" }), 3.0, TIERS, WIN, NOW);
    expect(r.move).toBe("thin");
  });

  it("the conversion exception: a cold-touched prospect's first load promotes at ONE load", () => {
    const contacts = [
      touch({ type: "cold", contacted_at: "2026-07-01T10:00:00Z" }),
      touch({ direction: "inbound", type: "inbound_inquiry", contacted_at: "2026-07-20T10:00:00Z" }),
    ];
    const loads = [load({ pickup_date: "2026-08-10", delivery_date: "2026-08-12" })];
    const [r] = buildReview([agent("a", 3)], loads, contacts, new Map(), 3.0, TIERS, WIN, NOW);
    expect(r.move).toBe("up");
    expect(r.why).toMatch(/cold-pool convert/);
    expect(r.why).toMatch(/they called you/);
  });

  it("an inactive Tier 3 doesn't get a row; an active one does", () => {
    const rows = buildReview(
      [agent("quiet", 3), agent("touched", 3)],
      [],
      [touch({ agent_id: "touched" })],
      new Map(), 3.0, TIERS, WIN, NOW,
    );
    expect(rows.map((r) => r.agent.agent_id)).toEqual(["touched"]);
  });

  it("netRpm and rate grade go null under the 2-load minimum; inbound null when unattributed", () => {
    const loads = [load({ delivery_date: "2026-08-10" })];
    const [r] = buildReview([agent("a", 2)], loads, [], new Map(), 3.0, TIERS, WIN, NOW);
    expect(r.netRpm).toBeNull();
    expect(r.rateGrade).toBeNull();
    expect(r.inbound).toBeNull();
  });

  it("inbound counts attributed loads only", () => {
    const loads = [
      load({ load_id: "1", delivery_date: "2026-08-01", booked_via: "agent_reached_out" }),
      load({ load_id: "2", delivery_date: "2026-08-02", booked_via: "i_reached_out" }),
      load({ load_id: "3", delivery_date: "2026-08-03" }), // legacy — outside the math
    ];
    const [r] = buildReview([agent("a", 1)], loads, [], new Map(), 3.0, TIERS, WIN, NOW);
    expect(r.inbound).toBeCloseTo(0.5, 5);
  });

  it("rows group by tier, revenue-desc within", () => {
    const rows = buildReview(
      [agent("t2big", 2), agent("t1", 1), agent("t2small", 2)],
      [
        load({ agent_id: "t1", load_id: "a1", delivery_date: "2026-08-01" }),
        load({ agent_id: "t2big", load_id: "b1", delivery_date: "2026-08-01", net_revenue: "9000" }),
        load({ agent_id: "t2small", load_id: "c1", delivery_date: "2026-08-01", net_revenue: "1000" }),
      ],
      [], new Map(), 3.0, TIERS, WIN, NOW,
    );
    expect(rows.map((r) => r.agent.agent_id)).toEqual(["t1", "t2big", "t2small"]);
  });
});

describe("the window filter — delivery-date basis, inclusive boundaries", () => {
  it("counts by DELIVERY date: pickup-in/delivery-out is excluded, and vice versa", () => {
    const loads = [
      load({ load_id: "in", pickup_date: "2026-05-30", delivery_date: "2026-06-03" }), // delivery = window start
      load({ load_id: "out", pickup_date: "2026-08-30", delivery_date: "2026-09-02" }), // delivers past window end
      load({ load_id: "edge", pickup_date: "2026-08-29", delivery_date: "2026-08-31" }), // window end, inclusive
    ];
    const [r] = buildReview([agent("a", 1)], loads, [], new Map(), 3.0, TIERS, WIN, NOW);
    expect(r.loads90).toBe(2); // "in" + "edge"; "out" belongs to September's review
  });

  it("the conversion exception ALSO rides delivery — a straddling first haul counts next month, with its load", () => {
    const contacts = [touch({ type: "cold", contacted_at: "2026-07-01T10:00:00Z" })];
    const straddle = [load({ pickup_date: "2026-08-30", delivery_date: "2026-09-02" })];
    // August review: not converted-in-window, no phantom 0-load promotion row…
    const aug = buildReview([agent("a", 3)], straddle, contacts, new Map(), 3.0, TIERS, WIN, NOW);
    expect(aug.find((r) => r.move === "up")).toBeUndefined();
    // …September review: the load AND the promotion appear together.
    const sepWin = reviewWindow("2026-09", new Date("2026-10-02T12:00:00Z"));
    const sep = buildReview([agent("a", 3)], straddle, contacts, new Map(), 3.0, TIERS, sepWin, new Date("2026-10-02T12:00:00Z"));
    expect(sep[0].move).toBe("up");
    expect(sep[0].loads90).toBe(1);
  });

  it("a convert ALREADY promoted to Tier 1 gets no phantom ▲ — nothing left to advise", () => {
    const contacts = [touch({ type: "cold", contacted_at: "2026-07-01T10:00:00Z" })];
    const loads = [load({ pickup_date: "2026-08-10", delivery_date: "2026-08-12" })];
    const [r] = buildReview([agent("a", 1)], loads, contacts, new Map(), 3.0, TIERS, WIN, NOW);
    expect(r.move).not.toBe("up");
  });
});

describe("reviewReportText", () => {
  it("plain text with tier headers and per-row verdicts", () => {
    const loads = [1, 2, 3].map((i) => load({ load_id: `l${i}`, delivery_date: `2026-08-0${i}` }));
    const rows = buildReview([agent("a", 1)], loads, [], tiers({ a: "solid" }), 3.0, TIERS, WIN, NOW);
    const t = reviewReportText(rows, WIN);
    expect(t).toContain("QUARTER ENDING AUG 31 ’26");
    expect(t).toContain("— TIER 1 —");
    expect(t).toContain("a X: 3 loads");
    expect(t).toContain("HOLD");
  });
});
