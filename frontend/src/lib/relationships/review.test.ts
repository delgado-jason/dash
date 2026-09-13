import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import {
  buildReviewModel,
  capAudit,
  chartEarned,
  directionOf,
  evidenceOf,
  goneQuiet,
  heldOn,
  holdKeyOf,
  holdTailOf,
  inboundByBucket,
  inboundMonths,
  milestoneBoard,
  monthKeysOf,
  monthsSigned,
  monthsSince,
  pruneLists,
  quarterMarketGrades,
  quarterModel,
  reviewPeriod,
  reviewReportText,
  reviewHygiene,
  reviewStatus,
  risers,
  scorecardRows,
  steadyAgents,
  suggestionsWithHolds,
  tierMovesIn,
  top3Share,
  type ReviewAgentLike,
  type ReviewContactLike,
  type TierHistoryLike,
} from "./review";
import type { BookCtx } from "./buckets";

// The clock is frozen at Sat Sep 12, 10:00 Central (vite.config pins TZ to
// America/Chicago). Ten in the morning is the SAME day in both zones, so this
// NOW alone proves nothing about the local/UTC seam: the cases that claim to
// cross it use EVENING-local timestamps — 8pm Central is already tomorrow in
// UTC — and they are marked where they appear.
const NOW = new Date("2026-09-12T15:00:00Z");
// 8pm Central on the given LOCAL day, as the ISO timestamp the API hands back:
// 01:00 UTC the NEXT day (CDT is UTC-5). Read with a UTC day key it lands on
// tomorrow — which is what the seam cases below are for.
const evening = (localDay: string): string =>
  `${new Date(Date.parse(`${localDay}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)}T01:00:00Z`;
const LADDER: RateLadder = { walkAway: 2.0, minimum: 2.5, target: 3.0, strong: 3.5 };

const agent = (id: string, tier: number | null, o: Partial<ReviewAgentLike> = {}): ReviewAgentLike => ({
  agent_id: id,
  first_name: id,
  last_name: "X",
  relationship_tier: tier,
  work_status: "active",
  preferred_contact: "phone",
  phone: "555-0000",
  best_time_to_call: "mornings",
  // A live record: a book that has heard nothing in 180 days shelves the agent
  // as Parked (dormant), which is a different test's subject.
  created_at: "2026-08-01T00:00:00Z",
  ...o,
});

// A delivered load: gross drives the all-in RPM, net drives the scorecard.
const load = (o: Partial<Load> & { agent_id: string }): Load =>
  ({
    load_id: Math.random().toString(36).slice(2),
    load_status: "delivered",
    pickup_date: "2026-08-01",
    delivery_date: "2026-08-03",
    origin_city: "Houston",
    origin_state: "TX",
    loaded_miles: 1000,
    deadhead_miles: 0,
    gross_revenue: "3200",
    net_revenue: "2400",
    ...o,
  }) as unknown as Load;

const touch = (o: Partial<ReviewContactLike> & { agent_id: string }): ReviewContactLike => ({
  contacted_at: "2026-09-01T14:00:00Z",
  direction: "outbound",
  method: "call",
  type: "capacity",
  ...o,
});

const ctxOf = (loads: Load[], contacts: ReviewContactLike[] = []): BookCtx => ({ loads, contacts, now: NOW, loadsReady: true });

// Three delivered loads at $3.20/mi all-in — above Target, under Strong.
const threeGood = (id: string): Load[] =>
  [1, 2, 3].map((i) => load({ agent_id: id, delivery_date: `2026-08-0${i}`, pickup_date: `2026-08-0${i}` }));

describe("reviewPeriod — ago 0 is the period we are IN", () => {
  it("the month: key, label and the 90 days ending today", () => {
    const p = reviewPeriod("month", 0, NOW);
    expect(p).toMatchObject({ key: "2026-09", label: "SEP ’26", name: "September", inProgress: true });
    expect(p.win.endKey).toBe("2026-09-12"); // clamped — no judging days that haven't happened
    expect(p.win.startKey).toBe("2026-06-15");
  });

  it("one step back is the last COMPLETE month, judged on its own last day", () => {
    const p = reviewPeriod("month", 1, NOW);
    expect(p.key).toBe("2026-08");
    expect(p.inProgress).toBe(false);
    expect(p.win.endKey).toBe("2026-08-31");
    expect(p.win.startKey).toBe("2026-06-03");
  });

  it("the quarter: a Qn key, and the window still ends today while it runs", () => {
    const p = reviewPeriod("quarter", 0, NOW);
    expect(p).toMatchObject({ key: "2026-Q3", label: "Q3 ’26", name: "Q3", inProgress: true });
    expect(p.win.endKey).toBe("2026-09-12");
    expect(monthKeysOf(p.range)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("stepping back from Q3 lands on Q2, whose months are all finished", () => {
    const p = reviewPeriod("quarter", 1, NOW);
    expect(p.key).toBe("2026-Q2");
    expect(p.win.endKey).toBe("2026-06-30");
  });
});

describe("IS IT WORKING — the cut by CURRENT bucket", () => {
  const agents = [agent("t1", 1), agent("t2", 2), agent("p", null)];
  const loads = [
    load({ agent_id: "t1", pickup_date: "2026-09-04", booked_via: "agent_reached_out" }),
    load({ agent_id: "t2", pickup_date: "2026-09-05", booked_via: "i_reached_out" }),
    load({ agent_id: "p", pickup_date: "2026-09-06", booked_via: "agent_reached_out" }),
    load({ agent_id: "t1", pickup_date: "2026-09-07" }), // legacy — no attribution, outside the math
    load({ agent_id: "t1", pickup_date: "2026-08-20", booked_via: "agent_reached_out" }), // before the window
  ];

  it("untiered agents sit in their own cell, never folded into Tier 3", () => {
    const cut = inboundByBucket(agents, loads, "2026-09-03", "2026-09-12", ctxOf(loads));
    expect(cut.all).toMatchObject({ attributed: 3, inbound: 2 });
    expect(cut.tier1).toMatchObject({ attributed: 1, inbound: 1 });
    expect(cut.tier2).toMatchObject({ attributed: 1, inbound: 0 });
    expect(cut.tier3).toMatchObject({ attributed: 0, inbound: 0, share: null }); // never a 0% bar
    expect(cut.prospects).toMatchObject({ attributed: 1, inbound: 1 });
  });

  it("an empty book gives null shares, not zeros", () => {
    const cut = inboundByBucket([], [], "2026-09-03", "2026-09-12", ctxOf([]));
    expect(cut.all).toEqual({ attributed: 0, inbound: 0, share: null });
  });

  it("the months run from the system's start, the first one from that very day", () => {
    expect(monthsSince("2026-09-03", "2026-09-12")).toEqual(["2026-09"]);
    expect(monthsSince("2026-06-15", "2026-09-12")).toEqual(["2026-06", "2026-07", "2026-08", "2026-09"]);
    const months = inboundMonths(agents, loads, "2026-08-25", "2026-09-12", ctxOf(loads));
    expect(months.map((m) => m.month)).toEqual(["2026-08", "2026-09"]);
    expect(months[0].all.attributed).toBe(0); // Aug 20 is before the start day
    expect(months[1].all.attributed).toBe(3);
  });

  it("the chart waits for three months carrying five attributed loads each", () => {
    const months = inboundMonths(agents, loads, "2026-08-25", "2026-09-12", ctxOf(loads));
    expect(chartEarned(months)).toBe(false);
    expect(chartEarned([])).toBe(false);
  });

  it("…and it IS earned at three months of five — the line has something to say", () => {
    const a = [agent("t1", 1)];
    // Five attributed pickups in each of Jul, Aug and Sep.
    const fat = ["07", "08", "09"].flatMap((m) =>
      [1, 2, 3, 4, 5].map((d) => load({ agent_id: "t1", pickup_date: `2026-${m}-0${d}`, booked_via: d === 1 ? "agent_reached_out" : "i_reached_out" })),
    );
    const months = inboundMonths(a, fat, "2026-07-01", "2026-09-12", ctxOf(fat));
    expect(months.map((m) => m.all.attributed)).toEqual([5, 5, 5]);
    expect(chartEarned(months)).toBe(true);
    // Four in one month and it is three dots pretending to be a line again.
    const thin = fat.filter((l) => l.pickup_date !== "2026-08-05");
    expect(chartEarned(inboundMonths(a, thin, "2026-07-01", "2026-09-12", ctxOf(thin)))).toBe(false);
  });
});

describe("RE-TIER SUGGESTIONS — the numbers disagreeing with the book", () => {
  it("an empty book suggests nothing", () => {
    expect(suggestionsWithHolds([], [], [], LADDER, [], NOW)).toMatchObject({ rows: [], needsTier: [], held: [], count: 0 });
  });

  it("no ladder, no verdict — never a default Tier 3", () => {
    const s = suggestionsWithHolds([agent("a", 2)], threeGood("a"), [], null, [], NOW);
    expect(s.count).toBe(0);
  });

  it("loads that didn't come through claim nothing", () => {
    const s = suggestionsWithHolds([agent("a", 2)], threeGood("a"), [], LADDER, [], NOW, false);
    expect(s.count).toBe(0);
  });

  it("a Tier 2 earning above Target is suggested up, with the evidence on the row", () => {
    const [r] = suggestionsWithHolds([agent("a", 2)], threeGood("a"), [], LADDER, [], NOW).rows;
    expect(r.suggestion).toBe("tier1");
    expect(r.direction).toBe("up");
    expect(r.suggestionWord).toBe("Tier 1");
    expect(r.evidence).toBe("$3.20 all-in on 3 loads · above Target");
    expect(r.holdKey).toBe("3 loads · above Target");
  });

  it("an established agent under walk-away is Losing money, and the button says Park?", () => {
    const loads = threeGood("a").map((l) => ({ ...l, gross_revenue: "1500" }) as Load);
    const [r] = suggestionsWithHolds([agent("a", 2)], loads, [], LADDER, [], NOW).rows;
    expect(r.suggestion).toBe("below");
    expect(r.losing).toBe(true);
    expect(r.suggestionWord).toBe("Park?");
    expect(r.direction).toBe("down");
  });

  it("an agent holding a tier without the footprint is suggested back to Prospect", () => {
    const loads = threeGood("a").slice(0, 2);
    const [r] = suggestionsWithHolds([agent("a", 1)], loads, [], LADDER, [], NOW).rows;
    expect(r.suggestion).toBe("prospect");
    expect(r.established).toBe(false);
    expect(r.evidence).toBe("not yet established — 2 of 3 loads");
    expect(r.holdKey).toBe("2 of 3 loads");
  });

  it("a hold on an unestablished seat is suppressed too, and lifts on the next load", () => {
    const a = agent("a", 1);
    const stored: TierHistoryLike[] = [
      { history_id: "h", agent_id: "a", from_tier: 1, to_tier: 1, reason: "hold — not yet established — 2 of 3 loads", changed_at: "2026-09-10T12:00:00Z" },
    ];
    expect(suggestionsWithHolds([a], threeGood("a").slice(0, 2), [], LADDER, stored, NOW).count).toBe(0);
    expect(suggestionsWithHolds([a], threeGood("a").slice(0, 1), [], LADDER, stored, NOW).count).toBe(1);
  });

  it("an established agent the owner never placed lands under NEEDS A TIER", () => {
    const s = suggestionsWithHolds([agent("a", null)], threeGood("a"), [], LADDER, [], NOW);
    expect(s.rows).toEqual([]);
    expect(s.needsTier).toHaveLength(1);
    expect(s.needsTier[0].needsTier).toBe(true);
    expect(s.count).toBe(1);
  });

  it("a parked agent is never argued with — the quarter's RISERS is the door back", () => {
    const parked = agent("a", null, { work_status: "parked" });
    expect(suggestionsWithHolds([parked], threeGood("a"), [], LADDER, [], NOW).count).toBe(0);
  });

  it("a prospect short of the gate has nothing to suggest", () => {
    const p = agent("p", null);
    expect(suggestionsWithHolds([p], [load({ agent_id: "p" })], [], LADDER, [], NOW).count).toBe(0);
  });
});

describe("the HOLD — quiet until the evidence moves", () => {
  const a = agent("a", 2);
  const hold = (reason: string, at = "2026-09-10T12:00:00Z"): TierHistoryLike => ({
    history_id: "h1",
    agent_id: "a",
    from_tier: 2,
    to_tier: 2,
    reason,
    changed_at: at,
  });

  it("a hold on exactly this evidence hides the suggestion", () => {
    const s = suggestionsWithHolds([a], threeGood("a"), [], LADDER, [hold("hold — $3.20 all-in on 3 loads · above Target")], NOW);
    expect(s.count).toBe(0);
    expect(s.held).toHaveLength(1);
    expect(s.held[0].held).toBe(true);
  });

  it("a cent of RPM drift inside the same band does NOT make the book nag again", () => {
    const s = suggestionsWithHolds([a], threeGood("a"), [], LADDER, [hold("hold — $3.19 all-in on 3 loads · above Target")], NOW);
    expect(s.count).toBe(0);
  });

  it("a fourth load lifts it — the delivered count is part of the evidence", () => {
    const four = [...threeGood("a"), load({ agent_id: "a", delivery_date: "2026-08-09", pickup_date: "2026-08-09" })];
    const s = suggestionsWithHolds([a], four, [], LADDER, [hold("hold — $3.20 all-in on 3 loads · above Target")], NOW);
    expect(s.count).toBe(1);
    expect(s.rows[0].holdKey).toBe("4 loads · above Target");
  });

  it("crossing a ladder band lifts it too", () => {
    const strong = threeGood("a").map((l) => ({ ...l, gross_revenue: "4000" }) as Load);
    const s = suggestionsWithHolds([a], strong, [], LADDER, [hold("hold — $3.20 all-in on 3 loads · above Target")], NOW);
    expect(s.count).toBe(1);
    expect(s.rows[0].band).toBe("above Strong");
  });

  it("a real tier move after the hold retires it — the latest row is what counts", () => {
    const history: TierHistoryLike[] = [
      hold("hold — $3.20 all-in on 3 loads · above Target", "2026-09-01T12:00:00Z"),
      { history_id: "h2", agent_id: "a", from_tier: 3, to_tier: 2, reason: "earning it", changed_at: "2026-09-08T12:00:00Z" },
    ];
    expect(suggestionsWithHolds([a], threeGood("a"), [], LADDER, history, NOW).count).toBe(1);
  });

  it("heldOn reads the prefix, not any old reason", () => {
    const key = holdKeyOf(3, "above Target", true);
    expect(heldOn([hold(`hold — $3.20 all-in on ${key}`)], "a", key)).toBe(true);
    expect(heldOn([hold(`$3.20 all-in on ${key}`)], "a", key)).toBe(false); // no prefix — not a hold
    expect(heldOn([], "a", key)).toBe(false);
  });

  it("the tail is compared on a BOUNDARY — 13 loads never swallows 3", () => {
    // The old endsWith() read "… on 13 loads · above Target" as ending with
    // "3 loads · above Target" and kept the suggestion hidden through ten more
    // loads. The tail is what follows the last " on ", and it must match whole.
    const thirteen = "hold — $3.20 all-in on 13 loads · above Target";
    expect(holdTailOf("$3.20 all-in on 13 loads · above Target")).toBe("13 loads · above Target");
    expect(heldOn([hold(thirteen)], "a", "$3.20 all-in on 3 loads · above Target")).toBe(false);
    // The unchanged case still holds — and the whole sentence is unchanged.
    expect(heldOn([hold(thirteen)], "a", "$3.20 all-in on 13 loads · above Target")).toBe(true);
    // The same boundary through the suggestions list: thirteen delivered loads
    // held, then the count really is thirteen — quiet; three — it speaks up.
    const thirteenLoads = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((i) =>
      load({ agent_id: "a", delivery_date: `2026-08-${String(i).padStart(2, "0")}`, pickup_date: `2026-08-${String(i).padStart(2, "0")}` }),
    );
    expect(suggestionsWithHolds([a], thirteenLoads, [], LADDER, [hold(thirteen)], NOW).count).toBe(0);
    expect(suggestionsWithHolds([a], threeGood("a"), [], LADDER, [hold(thirteen)], NOW).count).toBe(1);
  });

  it("the prefix is stripped in any case the backend might have stored it", () => {
    const evidence = "$3.20 all-in on 3 loads · above Target";
    expect(heldOn([hold(`Hold — ${evidence}`)], "a", evidence)).toBe(true);
    expect(heldOn([hold(`HOLD —${evidence}`)], "a", evidence)).toBe(true);
  });

  it("an unestablished hold is its own tail — there is no ' on ' to cut on", () => {
    expect(holdTailOf("not yet established — 2 of 3 loads")).toBe("not yet established — 2 of 3 loads");
    expect(heldOn([hold("hold — not yet established — 2 of 3 loads")], "a", "not yet established — 2 of 3 loads")).toBe(true);
    expect(heldOn([hold("hold — not yet established — 2 of 3 loads")], "a", "not yet established — 1 of 3 loads")).toBe(false);
  });

  it("the evidence sentence ALWAYS ends with the key the suppression compares", () => {
    expect(evidenceOf(3.6, false, 3, "above Strong", true).endsWith(holdKeyOf(3, "above Strong", true))).toBe(true);
    expect(evidenceOf(null, false, 1, null, false).endsWith(holdKeyOf(1, null, false))).toBe(true);
    expect(evidenceOf(null, false, 3, null, true)).toBe("no RPM on 3 loads · no band");
    expect(evidenceOf(3.6, true, 3, "above Strong", true)).toContain("all-in*"); // a load with no deadhead logged
    expect(evidenceOf(null, false, 1, null, false)).toBe("not yet established — 1 of 3 loads");
  });

  it("direction reads the ladder's own order", () => {
    expect(directionOf("tier2", "tier1")).toBe("up");
    expect(directionOf("tier1", "prospect")).toBe("down");
    expect(directionOf("tier2", "tier2")).toBe("flat");
    expect(directionOf("tier1", "below")).toBe("down");
    expect(directionOf("tier1", null)).toBe("flat");
  });
});

describe("CONTACT CAP — the audit that should read zero", () => {
  it("two proactive touches in the local week name the agent; one is just 'touched once'", () => {
    const agents = [agent("a", 1), agent("b", 2), agent("c", 3)];
    const contacts = [
      touch({ agent_id: "a", contacted_at: "2026-09-08T14:00:00Z", type: "capacity" }),
      touch({ agent_id: "a", contacted_at: "2026-09-10T14:00:00Z", type: "milestone", cap_override: true }),
      touch({ agent_id: "b", contacted_at: "2026-09-09T14:00:00Z", type: "capacity" }),
      touch({ agent_id: "c", contacted_at: "2026-09-09T14:00:00Z", type: "close_out" }), // operational — never capped
      touch({ agent_id: "a", contacted_at: "2026-08-20T14:00:00Z", type: "capacity" }), // last month
    ];
    const audit = capAudit(agents, contacts, NOW);
    expect(audit.week).toBe("2026-09-07"); // the local Monday
    expect(audit.over).toHaveLength(1);
    expect(audit.over[0].agent.agent_id).toBe("a");
    expect(audit.over[0].touches.map((t) => t.type)).toEqual(["capacity", "milestone"]);
    expect(audit.over[0].override).toBe(true);
    expect(audit.touchedOnce).toBe(1);
    expect(audit.overrides).toBe(1);
  });

  it("a quiet week reads zero over and zero touched", () => {
    expect(capAudit([agent("a", 1)], [], NOW)).toMatchObject({ over: [], touchedOnce: 0, overrides: 0, overrideOnly: [] });
  });

  it("an override that stayed inside the cap gets a row of its own — counted AND named", () => {
    const agents = [agent("solo", 1), agent("plain", 2), agent("over", 3)];
    const contacts = [
      touch({ agent_id: "solo", contacted_at: "2026-09-10T14:00:00Z", type: "capacity", cap_override: true, note: "he asked for the Tulsa lane" }),
      touch({ agent_id: "plain", contacted_at: "2026-09-09T14:00:00Z", type: "capacity" }),
      touch({ agent_id: "over", contacted_at: "2026-09-08T14:00:00Z", type: "capacity" }),
      touch({ agent_id: "over", contacted_at: "2026-09-10T14:00:00Z", type: "milestone", cap_override: true }),
    ];
    const audit = capAudit(agents, contacts, NOW);
    expect(audit.overrides).toBe(2);
    // The over-cap agent already names both touches; only the single-touch
    // override needs its own row.
    expect(audit.overrideOnly.map((r) => r.agent.agent_id)).toEqual(["solo"]);
    expect(audit.overrideOnly[0].touches[0].note).toBe("he asked for the Tulsa lane");
    expect(audit.touchedOnce).toBe(2); // solo and plain
    expect(audit.over.map((r) => r.agent.agent_id)).toEqual(["over"]);
  });

  it("the week is Brandie's: a Sunday 8pm touch belongs to the week that ENDED, not this one", () => {
    // Sun Sep 6 at 8pm local is Mon Sep 7 at 01:00 UTC — the first hour of the
    // current cap week if the day key is read in UTC.
    const contacts = [touch({ agent_id: "a", contacted_at: evening("2026-09-06"), type: "capacity" })];
    expect(contacts[0].contacted_at).toBe("2026-09-07T01:00:00Z");
    const audit = capAudit([agent("a", 1)], contacts, NOW);
    expect(audit.week).toBe("2026-09-07");
    expect(audit.touchedOnce).toBe(0); // last week's touch — this week is clean
    expect(audit.over).toEqual([]);
    // The Monday evening after it IS this week.
    const monday = [touch({ agent_id: "a", contacted_at: evening("2026-09-07"), type: "capacity" })];
    expect(capAudit([agent("a", 1)], monday, NOW).touchedOnce).toBe(1);
  });
});

describe("HYGIENE — the Friday five's three rules plus the footprint's sixth question", () => {
  it("adds best time to call, and says nothing when nothing is missing", () => {
    const full = agent("ok", 1);
    const loads = [load({ agent_id: "ok" })];
    expect(reviewHygiene([full], loads, [])).toEqual([]);
    const gap = agent("gap", 1, { best_time_to_call: "  " });
    const items = reviewHygiene([gap], [load({ agent_id: "gap" })], []);
    expect(items.map((i) => i.key)).toEqual(["best_time"]);
    expect(items[0].agents).toHaveLength(1);
  });

  it("still carries the phone / preferred / footprint rules from one place", () => {
    const bare = agent("bare", 1, { phone: null, preferred_contact: null, best_time_to_call: null });
    expect(reviewHygiene([bare], [], []).map((i) => i.key)).toEqual(["phone", "preferred", "footprint", "best_time"]);
  });
});

describe("TIER MOVES and GONE QUIET", () => {
  const history: TierHistoryLike[] = [
    { history_id: "1", agent_id: "a", from_tier: 2, to_tier: 1, reason: "above Target on 4", changed_at: "2026-09-04T10:00:00Z" },
    { history_id: "2", agent_id: "b", from_tier: 1, to_tier: 1, reason: "hold — $3.20 all-in on 3 loads · above Target", changed_at: "2026-09-06T10:00:00Z" },
    { history_id: "3", agent_id: "c", from_tier: null, to_tier: 3, reason: "first three loads", changed_at: "2026-05-04T10:00:00Z" },
  ];

  it("holds never print as moves, and the window is inclusive at both ends", () => {
    const moves = tierMovesIn(history, "2026-06-15", "2026-09-12");
    expect(moves.map((m) => m.history_id)).toEqual(["1"]);
    // the board is headed "this month", so it reads the period's own calendar
    expect(tierMovesIn(history, "2026-09-01", "2026-09-30").map((m) => m.history_id)).toEqual(["1"]);
    expect(tierMovesIn(history, "2026-08-01", "2026-08-31")).toEqual([]);
    expect(tierMovesIn(history, "2026-05-04", "2026-09-12").map((m) => m.history_id)).toEqual(["1", "3"]);
    expect(tierMovesIn([], "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("a move made at 8pm on the last day of the month belongs to THAT month", () => {
    // Aug 31, 8pm local = Sep 1, 01:00 UTC. "This month" is one calendar on
    // this page — the local one, the same the milestone board reads.
    const late: TierHistoryLike[] = [
      { history_id: "late", agent_id: "a", from_tier: 3, to_tier: 2, reason: "earning it", changed_at: evening("2026-08-31") },
    ];
    expect(late[0].changed_at).toBe("2026-09-01T01:00:00Z");
    expect(tierMovesIn(late, "2026-08-01", "2026-08-31").map((m) => m.history_id)).toEqual(["late"]);
    expect(tierMovesIn(late, "2026-09-01", "2026-09-30")).toEqual([]);
  });

  it("gone quiet is Tier 1 and 2 only, at or past thirty days — never-contacted included", () => {
    const agents = [agent("a", 1), agent("b", 2), agent("c", 3), agent("d", 1), agent("e", 1, { work_status: "parked" })];
    const contacts = [
      touch({ agent_id: "a", contacted_at: "2026-08-13T14:00:00Z", outcome: "reached" }), // 30d — quiet
      touch({ agent_id: "b", contacted_at: "2026-09-10T14:00:00Z", outcome: "reached" }), // 2d
      touch({ agent_id: "c", contacted_at: "2026-01-10T14:00:00Z", outcome: "reached" }), // Tier 3, not asked
    ];
    const rows = goneQuiet(agents, contacts, [], NOW);
    expect(rows.map((r) => r.agent.agent_id)).toEqual(["d", "a"]); // never-contacted sorts quietest
    expect(rows[1].days).toBe(30);
    expect(rows[0].days).toBeNull();
  });
});

describe("THE SCORECARD — the verdict is the suggestion's own direction", () => {
  const win = reviewPeriod("month", 0, NOW).win;
  const score = (agents: ReviewAgentLike[], loads: Load[], contacts: ReviewContactLike[] = []) =>
    scorecardRows(agents, loads, contacts, LADDER, win, suggestionsWithHolds(agents, loads, contacts, LADDER, [], NOW), NOW);

  it("under three loads in the window there is NO verdict — THIN, never a fake grade", () => {
    const a = agent("a", 1);
    const [r] = score([a], [load({ agent_id: "a", delivery_date: "2026-07-01", pickup_date: "2026-07-01" })]);
    expect(r.verdict).toBe("thin");
    expect(r.why).toContain("under the 3-load bar");
    expect(r.loads).toBe(1);
  });

  it("a ▼ on a Tier 1 we barely reached out to reads HOLD — the verdict is on us", () => {
    const a = agent("a", 1);
    const loads = threeGood("a").map((l) => ({ ...l, gross_revenue: "2200", delivery_date: "2026-07-10", pickup_date: "2026-07-10" }) as Load);
    const [r] = score([a], loads, [touch({ agent_id: "a", contacted_at: "2026-07-11T14:00:00Z" })]);
    expect(r.verdict).toBe("hold");
    expect(r.why).toBe("never fed — 1 out-day this quarter; the verdict is on us");
  });

  it("with four out-days behind it the ▼ stands", () => {
    const a = agent("a", 1);
    const loads = threeGood("a").map((l) => ({ ...l, gross_revenue: "2200", delivery_date: "2026-07-10", pickup_date: "2026-07-10" }) as Load);
    const contacts = ["07-11", "07-18", "08-02", "08-20"].map((d) => touch({ agent_id: "a", contacted_at: `2026-${d}T14:00:00Z` }));
    const [r] = score([a], loads, contacts);
    expect(r.verdict).toBe("down");
    expect(r.outDays).toBe(4);
  });

  it("out-days count DISTINCT days — four notes from one call is one day of attention", () => {
    const a = agent("a", 1);
    const contacts = [
      touch({ agent_id: "a", contacted_at: "2026-07-11T14:00:00Z" }),
      touch({ agent_id: "a", contacted_at: "2026-07-11T18:00:00Z" }),
      touch({ agent_id: "a", contacted_at: "2026-07-12T14:00:00Z", direction: "inbound", type: "inbound_inquiry" }),
    ];
    const [r] = score([a], threeGood("a"), contacts);
    expect(r.outDays).toBe(1);
    expect(r.inboundTouches).toBe(1);
  });

  it("the row's money: net, net per mile with its grade, deadhead share and the inbound fraction", () => {
    const a = agent("a", 1);
    const loads = threeGood("a").map((l) => ({ ...l, deadhead_miles: 250, booked_via: "agent_reached_out" }) as Load);
    const [r] = score([a], loads);
    expect(r.net).toBe(7200);
    expect(r.netRpm).toBeCloseTo(2.4, 5);
    expect(r.grade).toBe("minimum");
    expect(r.deadheadPct).toBeCloseTo(250 / 1250, 5);
    expect(r.inbound).toMatchObject({ attributed: 3, inbound: 3 });
  });

  it("Tier 1 and 2 always answer for themselves; Tier 3 and Prospects only when the window has a story", () => {
    const agents = [agent("t1", 1), agent("t3", 3), agent("p", null), agent("k", 1, { work_status: "parked" })];
    const rows = score(agents, []);
    expect(rows.map((r) => r.agent.agent_id)).toEqual(["t1"]);
    const withStory = score(agents, [], [touch({ agent_id: "t3" })]);
    expect(withStory.map((r) => r.agent.agent_id)).toEqual(["t1", "t3"]);
  });

  it("no loads at all → null rates, not zeros", () => {
    const [r] = score([agent("a", 1)], []);
    expect(r.netRpm).toBeNull();
    expect(r.grade).toBeNull();
    expect(r.deadheadPct).toBeNull();
    expect(r.inbound.share).toBeNull();
    expect(r.lastLoadDays).toBeNull();
  });

  it("no ladder → NO verdict — never 'the band agrees with the tier' about a band nobody drew", () => {
    const a = agent("a", 1);
    const loads = threeGood("a");
    const rows = scorecardRows([a], loads, [], null, win, suggestionsWithHolds([a], loads, [], null, [], NOW), NOW);
    expect(rows[0].verdict).toBe("thin"); // locked, like under three loads
    expect(rows[0].why).toBe("no rate ladder — no verdict");
    expect(rows[0].grade).toBeNull();
    // The money still adds up — it is the JUDGEMENT that is withheld.
    expect(rows[0].loads).toBe(3);
    expect(rows[0].net).toBe(7200);
    // With a ladder the same three loads earn the seat.
    expect(score([a], loads)[0].why).toBe("earning the seat — the band agrees with the tier");
    // …and under three loads the thin verdict still names the load count.
    const one = [load({ agent_id: "a", delivery_date: "2026-07-01", pickup_date: "2026-07-01" })];
    expect(scorecardRows([a], one, [], null, win, suggestionsWithHolds([a], one, [], null, [], NOW), NOW)[0].why).toContain(
      "under the 3-load bar",
    );
  });

  it("out-days are BRANDIE'S days: three evening calls and a Saturday morning are four, and the ▼ stands", () => {
    // Mon/Wed/Fri at 8pm local are Tue/Thu/Sat 01:00 UTC. Counted in UTC the
    // Friday evening and the Saturday morning collapse into one day — three
    // out-days, and a ▼ on a Tier 1 would flip to "never fed".
    const a = agent("a", 1);
    const loads = threeGood("a").map((l) => ({ ...l, gross_revenue: "2200", delivery_date: "2026-07-10", pickup_date: "2026-07-10" }) as Load);
    const contacts = [
      touch({ agent_id: "a", contacted_at: evening("2026-07-13") }), // Mon 8pm
      touch({ agent_id: "a", contacted_at: evening("2026-07-15") }), // Wed 8pm
      touch({ agent_id: "a", contacted_at: evening("2026-07-17") }), // Fri 8pm
      touch({ agent_id: "a", contacted_at: "2026-07-18T15:00:00Z" }), // Sat 10am
    ];
    const [r] = score([a], loads, contacts);
    expect(r.outDays).toBe(4);
    expect(r.verdict).toBe("down");
  });
});

describe("MILESTONES — what is waiting, and what went out this month", () => {
  // Five delivered loads crosses the first load-count threshold.
  const five = (id: string): Load[] =>
    [1, 2, 3, 4, 5].map((i) => load({ agent_id: id, delivery_date: `2026-07-0${i}`, pickup_date: `2026-07-0${i}` }));

  it("a crossing waits until a marker closes it — sent on a contact, or skipped in a note", () => {
    const a = agent("a", 1);
    const open = milestoneBoard([a], five("a"), [], [], NOW);
    expect(open.waiting.map((f) => f.marker)).toEqual(["[milestone:loads-5]"]);
    expect(open.sentThisMonth).toBe(0);

    // Sent: the marker rides on this month's contact note.
    const sent = milestoneBoard(
      [a],
      five("a"),
      [touch({ agent_id: "a", contacted_at: "2026-09-09T14:00:00Z", type: "milestone", note: "[milestone:loads-5] 5 loads together" })],
      [],
      NOW,
    );
    expect(sent.waiting).toEqual([]);
    expect(sent.sentThisMonth).toBe(1);

    // Skipped: an agent NOTE closes the flag without being a touch — it never
    // counts against the cap, and it is not "sent" either.
    const skipped = milestoneBoard([a], five("a"), [], [{ agent_id: "a", note: "[milestone:loads-5:skipped]" }], NOW);
    expect(skipped.waiting).toEqual([]);
    expect(skipped.sentThisMonth).toBe(0);
  });

  it("a marker sent at 8pm on the last day of the month counts in THAT month", () => {
    // Aug 31, 8pm local = Sep 1, 01:00 UTC. Read in UTC it would be counted as
    // September's work.
    const a = agent("a", 1);
    const lateAug = [
      touch({ agent_id: "a", contacted_at: evening("2026-08-31"), type: "milestone", note: "[milestone:loads-5] 5 loads together" }),
    ];
    expect(lateAug[0].contacted_at).toBe("2026-09-01T01:00:00Z");
    expect(milestoneBoard([a], five("a"), lateAug, [], NOW).sentThisMonth).toBe(0); // not September's
    expect(milestoneBoard([a], five("a"), lateAug, [], new Date("2026-08-31T15:00:00Z")).sentThisMonth).toBe(1); // August's
  });

  it("an empty book has nothing waiting and nothing sent", () => {
    expect(milestoneBoard([], [], [], [], NOW)).toEqual({ waiting: [], sentThisMonth: 0 });
  });
});

describe("THE QUARTER — concentration, steadiness, the months signed, the risers", () => {
  const q = reviewPeriod("quarter", 0, NOW).range;
  const inQ = (id: string, day: string, o: Partial<Load> = {}) => load({ agent_id: id, delivery_date: day, pickup_date: day, ...o });

  it("top-3 share of net is null with no freight, and a fraction with it", () => {
    expect(top3Share([], q)).toBeNull();
    const loads = [inQ("a", "2026-07-05"), inQ("b", "2026-07-06"), inQ("c", "2026-07-07"), inQ("d", "2026-07-08")];
    expect(top3Share(loads, q)).toBeCloseTo(0.75, 5);
  });

  it("steady = two or more delivered loads inside the quarter", () => {
    const loads = [inQ("a", "2026-07-05"), inQ("a", "2026-08-05"), inQ("b", "2026-07-06"), inQ("c", "2026-06-30")];
    expect(steadyAgents(loads, q)).toBe(1);
  });

  it("months signed counts only the months that have started", () => {
    const reviews = [{ period_key: "2026-07", kind: "month" as const, targets: "call Eric", reviewed_at: "2026-08-01T00:00:00Z" }];
    expect(monthsSigned(reviews, q, "2026-09-12")).toEqual({ signed: 1, of: 3, missing: ["Aug", "Sep"] });
    expect(monthsSigned([], q, "2026-07-04")).toEqual({ signed: 0, of: 1, missing: ["Jul"] });
  });

  it("a quarter's own sign-off never counts as one of its months", () => {
    // The audit and a month can't collide on a key — 'YYYY-Qn' vs 'YYYY-MM' —
    // but the kind is the gate, so a row filed under a month key with kind
    // 'quarter' is still not that month's signature.
    const reviews = [
      { period_key: "2026-Q3", kind: "quarter" as const, targets: "Gary\nLisa", reviewed_at: "2026-10-01T00:00:00Z" },
      { period_key: "2026-07", kind: "quarter" as const, targets: "misfiled", reviewed_at: "2026-08-01T00:00:00Z" },
      { period_key: "2026-08", kind: "month" as const, targets: "call Eric", reviewed_at: "2026-09-01T00:00:00Z" },
    ];
    expect(monthsSigned(reviews, q, "2026-09-12")).toEqual({ signed: 1, of: 3, missing: ["Jul", "Sep"] });
  });

  it("a Parked agent giving repeat freight this quarter is a Riser", () => {
    const parked = agent("k", null, { work_status: "parked" });
    const quiet = agent("q", null, { work_status: "parked" });
    const loads = [inQ("k", "2026-07-05"), inQ("k", "2026-08-05"), inQ("q", "2026-07-06")];
    expect(risers([parked, quiet], loads, q, ctxOf(loads)).map((a) => a.agent_id)).toEqual(["k"]);
  });

  it("fed and quiet is a prune candidate; barely fed is a to-do, not a prune", () => {
    const fed = agent("fed", 1);
    const never = agent("never", 2);
    const contacts = [
      ...["07-05", "07-19", "08-03", "08-21"].map((d) => touch({ agent_id: "fed", contacted_at: `2026-${d}T14:00:00Z` })),
      touch({ agent_id: "never", contacted_at: "2026-07-05T14:00:00Z" }),
    ];
    const lists = pruneLists([fed, never], [], contacts, q, ctxOf([], contacts));
    expect(lists.fedStayedQuiet.map((r) => r.agent.agent_id)).toEqual(["fed"]);
    expect(lists.fedStayedQuiet[0].outDays).toBe(4);
    expect(lists.neverFed.map((r) => r.agent.agent_id)).toEqual(["never"]);
  });

  it("an inbound touch keeps a fed agent off the prune list — they did answer", () => {
    const fed = agent("fed", 1);
    const contacts = [
      ...["07-05", "07-19", "08-03", "08-21"].map((d) => touch({ agent_id: "fed", contacted_at: `2026-${d}T14:00:00Z` })),
      touch({ agent_id: "fed", contacted_at: "2026-08-22T14:00:00Z", direction: "inbound", type: "inbound_inquiry" }),
    ];
    expect(pruneLists([fed], [], contacts, q, ctxOf([], contacts)).fedStayedQuiet).toEqual([]);
  });

  it("an agent who hauled this quarter is on neither list", () => {
    const a = agent("a", 1);
    const loads = [inQ("a", "2026-07-05")];
    const lists = pruneLists([a], loads, [], q, ctxOf(loads));
    expect(lists.fedStayedQuiet).toEqual([]);
    expect(lists.neverFed).toEqual([]);
  });

  it("a morning and an evening on the same local day are ONE out-day — the agent stays NEVER FED", () => {
    // 10am and 8pm on Jul 15. In UTC the evening call is Jul 16, so two days
    // of "effort" appear and the agent slips off the never-fed to-do list.
    const a = agent("a", 1);
    const contacts = [
      touch({ agent_id: "a", contacted_at: "2026-07-15T15:00:00Z" }), // 10am local
      touch({ agent_id: "a", contacted_at: evening("2026-07-15") }), // 8pm local — Jul 16 in UTC
    ];
    const lists = pruneLists([a], [], contacts, q, ctxOf([], contacts));
    expect(lists.neverFed.map((r) => r.agent.agent_id)).toEqual(["a"]);
    expect(lists.neverFed[0].outDays).toBe(1);
    expect(lists.fedStayedQuiet).toEqual([]);
  });

  it("markets to hunt rank states by average gross per delivered load", () => {
    const loads = [
      inQ("a", "2026-07-05", { origin_state: "TX", gross_revenue: "2000" }),
      inQ("a", "2026-07-06", { origin_state: "TX", gross_revenue: "4000" }),
      inQ("b", "2026-07-07", { origin_state: "OK", gross_revenue: "5000" }),
      inQ("c", "2026-07-08", { origin_state: "", gross_revenue: "9000" }), // no state — no market
    ];
    expect(quarterMarketGrades(loads, q)).toEqual([
      { state: "OK", loads: 1, avgGross: 5000 },
      { state: "TX", loads: 2, avgGross: 3000 },
    ]);
    expect(quarterMarketGrades([], q)).toEqual([]);
  });

  it("the quarter model compares against the quarter BEFORE it", () => {
    const agents = [agent("a", 1), agent("b", 2)];
    const loads = [
      inQ("a", "2026-07-05"), // Q3
      inQ("a", "2026-08-05"), // Q3 — steady
      inQ("b", "2026-05-05"), // Q2
      inQ("b", "2026-06-05"), // Q2 — steady last quarter
      inQ("a", "2026-06-10", { net_revenue: "3000" }), // Q2
    ];
    const m = quarterModel(agents, loads, [], [], reviewPeriod("quarter", 0, NOW), ctxOf(loads), NOW);
    expect(m.range.start.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(m.prev.start.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(m.steady).toEqual({ n: 1, prev: 1 }); // a this quarter, b last
    expect(m.top3.share).toBeCloseTo(1, 5); // two agents, both inside the top three
    expect(m.top3.prev).toBeCloseTo(1, 5);
    expect(m.opensIn).toBe(19); // Sep 12 → Oct 1
  });

  it("Q1's previous quarter is the PRIOR YEAR's Q4 — the wrap is a year, not a month", () => {
    const q1 = reviewPeriod("quarter", 0, new Date("2026-02-10T15:00:00Z"));
    expect(q1.key).toBe("2026-Q1");
    const m = quarterModel([], [], [], [], q1, ctxOf([]), new Date("2026-02-10T15:00:00Z"));
    expect(m.prev.start.toISOString().slice(0, 10)).toBe("2025-10-01");
    expect(m.prev.end.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(m.top3.prev).toBeNull(); // no freight back there — null, never 0%
    expect(m.steady.prev).toBe(0);
  });
});

describe("the whole model, and the sub-line's three numbers", () => {
  const agents = [agent("a", 2), agent("b", 1)];
  const loads = threeGood("a");
  const contacts = [touch({ agent_id: "a", contacted_at: "2026-09-09T14:00:00Z" })];

  it("builds every board from one pass and answers the statusbar the same way", () => {
    const period = reviewPeriod("month", 0, NOW);
    const m = buildReviewModel({
      agents,
      loads,
      contacts,
      notes: [],
      coverage: [],
      history: [],
      reviews: [],
      ladder: LADDER,
      period,
      systemStart: "2026-09-03",
      now: NOW,
    });
    // a: Tier 2 earning Tier 1 · b: a Tier 1 seat with no loads behind it
    expect(m.suggestions.rows.map((r) => [r.agent.agent_id, r.suggestionWord])).toEqual([
      ["b", "Prospect"],
      ["a", "Tier 1"],
    ]);
    expect(m.cooling.flagged.map((r) => r.agent.agent_id)).toEqual(["b"]); // never a two-way contact
    expect(m.quarter).toBeNull(); // month scope
    expect(m.signed).toBeNull();

    const status = reviewStatus({ agents, loads, contacts, history: [], reviews: [], ladder: LADDER, now: NOW });
    expect(status).toEqual({ suggestions: 2, cooling: 1, signed: false, periodName: "September" });
  });

  it("a signed month is found by its own key and kind", () => {
    const reviews = [{ period_key: "2026-09", kind: "month" as const, targets: "call Eric\nfix the phones", reviewed_at: "2026-09-11T00:00:00Z", reviewed_by_name: "Jason" }];
    const status = reviewStatus({ agents, loads, contacts, history: [], reviews, ladder: LADDER, now: NOW });
    expect(status.signed).toBe(true);
  });

  it("the report carries the cap's overrides — the count in the head and the row that explains it", () => {
    const over = agent("o", 1);
    const capContacts = [
      touch({
        agent_id: "o",
        contacted_at: "2026-09-10T14:00:00Z",
        type: "capacity",
        cap_override: true,
        note: "he asked for the Tulsa lane",
      }),
    ];
    const m = buildReviewModel({
      agents: [over],
      loads: threeGood("o"),
      contacts: capContacts,
      notes: [],
      coverage: [],
      history: [],
      reviews: [],
      ladder: LADDER,
      period: reviewPeriod("month", 0, NOW),
      systemStart: "2026-09-03",
      now: NOW,
    });
    expect(m.cap.overrides).toBe(1);
    expect(m.cap.overrideOnly).toHaveLength(1);
    const text = reviewReportText(m);
    expect(text).toContain("1 overrides this week");
    expect(text).toContain("logged over the cap: “he asked for the Tulsa lane”");
  });

  it("an empty book still produces a report — and it never invents a percentage", () => {
    const period = reviewPeriod("quarter", 0, NOW);
    const m = buildReviewModel({
      agents: [],
      loads: [],
      contacts: [],
      notes: [],
      coverage: [],
      history: [],
      reviews: [],
      ladder: null,
      period,
      systemStart: "2026-09-03",
      now: NOW,
    });
    const text = reviewReportText(m);
    expect(text).toContain("RELATIONSHIPS REVIEW — Q3 ’26 (in progress)");
    expect(text).toContain("IS IT WORKING — 0 of 0 came to you");
    expect(text).not.toContain("0%");
    expect(text).toContain("No tier moves this quarter.");
    expect(text).toContain("tier moves are the owner's — with a written reason, every time.");
    expect(m.quarter?.opensIn).toBe(19); // Sep 12 → Oct 1
  });
});
