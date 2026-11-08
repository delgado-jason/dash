// THE AGENTS LEADERBOARD on the synthetic book (Cockpit PR 1, brief B).
// Rules locked: the grade words follow the booking ladder; the gate is three
// delivered loads; shares sum to 1 over attributed loads; the default order is
// graded-by-rate then ungraded-by-rate; no miles means a null rate, never $0.
// A red test here means a business rule moved: the PR body must say
// "Rule change: <id> — <why>".
import { describe, it, expect } from "vitest";
import { syntheticBook, TODAY } from "@/test/fixtures/book";
import type { Agency } from "@/types/agency";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import { ESTABLISHED_AT } from "@/lib/relationships/tierSuggestion";
import { buildLeaderboard, GRADE_WORD } from "@/lib/metrics/leaderboard";

const now = new Date(`${TODAY}T00:00:00Z`);
const LADDER: RateLadder = { walkAway: 3.0, minimum: 3.3, target: 3.6, strong: 4.0 };

// The book's loads name an agency and five agents by id only; give them rows.
const peopleOf = (loads: Load[]) => {
  const agencies: Agency[] = [];
  const agents: Agent[] = [];
  for (const l of loads) {
    if (l.agency_id && !agencies.some((a) => a.agency_id === l.agency_id)) {
      agencies.push({
        agency_id: l.agency_id,
        user_id: "u",
        agency_code: l.agency_code ?? "NRT",
        name: "Agency North",
        posting_codes: [l.agency_code ?? "NRT"],
        created_at: "",
        updated_at: "",
      });
    }
    if (l.agent_id && !agents.some((a) => a.agent_id === l.agent_id)) {
      agents.push({
        agent_id: l.agent_id,
        agency_id: l.agency_id,
        agency_code: l.agency_code,
        agency_name: null,
        posting_code: l.posting_code,
        first_name: "Agent",
        last_name: l.agent_id,
        preferred_contact: null,
        relationship_tier: null,
        created_at: "",
        updated_at: "",
      });
    }
  }
  return { agencies, agents };
};

// Spread the book's loads over one desk per agent, so the board has a field.
const field = () => {
  const book = syntheticBook();
  const loads = book.loads.map((l) => ({ ...l, agency_id: `desk-${l.agent_id}`, agency_code: String(l.posting_code) }));
  return { loads, ...peopleOf(loads) };
};

const lbOf = (ladder: RateLadder | null = LADDER, f = field()) =>
  buildLeaderboard({ ...f, contacts: [], ladder, now });

describe("leaderboard · the rules", () => {
  const lb = lbOf();

  it("the gate is three delivered loads (lifetime, over the desk's people)", () => {
    expect(ESTABLISHED_AT).toBe(3);
    for (const r of lb.rows) expect(r.graded).toBe(r.lifetime >= 3);
    expect(lb.rows.some((r) => r.graded)).toBe(true);
  });

  it("the grade words follow the ladder's bands", () => {
    for (const r of lb.rows.filter((x) => x.graded && x.allInRpm != null)) {
      const rpm = r.allInRpm!;
      const want =
        rpm >= 4.0 ? "strong" : rpm >= 3.6 ? "target" : rpm >= 3.0 ? "minimum" : "below";
      expect(r.grade).toBe(want);
      expect(r.gradeWord).toBe(GRADE_WORD[want]);
    }
    for (const r of lb.rows.filter((x) => !x.graded)) expect(r.gradeWord).toBe("");
  });

  it("no ladder, no verdict", () => {
    for (const r of lbOf(null).rows) {
      expect(r.grade).toBeNull();
      expect(r.gradeWord).toBe("");
    }
  });

  it("shares sum to 1 over the attributed loads", () => {
    expect(lb.rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 10);
  });

  it("the default order is graded-by-rate, then ungraded-by-rate", () => {
    const rate = (r: { allInRpm: number | null }) => r.allInRpm ?? -Infinity;
    const g = lb.rows.filter((r) => r.graded);
    const u = lb.rows.filter((r) => !r.graded);
    expect(lb.rows).toEqual([...g, ...u]);
    for (const part of [g, u]) {
      for (let i = 1; i < part.length; i++) expect(rate(part[i - 1])).toBeGreaterThanOrEqual(rate(part[i]));
    }
  });

  it("a desk with no miles has a null rate and never $0", () => {
    const f = field();
    f.loads = f.loads.map((l) => ({ ...l, loaded_miles: 0, deadhead_miles: 0 }));
    for (const r of lbOf(LADDER, f).rows) {
      expect(r.allInRpm).toBeNull();
      expect(r.allInRpm).not.toBe(0);
      expect(r.grade).toBeNull();
    }
  });
});
