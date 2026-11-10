// The silent-zero ratchet (CASH-16 · PLAN-06 · SCORE-02 · NET-03).
//
// `?? 0`, `|| 0`, `|| 2000`, `?? 70` and an empty `.catch(() => {})` turn a
// missing input into a number (or into silence). In the money files below,
// every such line must be listed in silent-zero-allowlist.json with an honest
// reason. A new unlisted line fails; the list can only shrink: retire a line,
// delete its entry, and lower `max`. Lines whose reason starts with
// "SILENT ZERO" are the debt to retire.
//
// Rule-change gate: touching this list or `max` upward is a deliberate change
// and needs a 'Rule change: <id>' line in the PR body.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import allowlist from "./silent-zero-allowlist.json";

const FILES = [
  "src/lib/metrics/rateTargets.ts",
  "src/lib/metrics/cashBoard.ts",
  "src/lib/metrics/cashBoardInput.ts",
  "src/lib/metrics/planStatus.ts",
  "src/lib/metrics/cashflow.ts",
  "src/lib/metrics/settlements.ts",
  "src/lib/metrics/loadScore.ts",
  // Added v1.267.1 (C1a): estimateLoadFuel coalesced a missing deadhead to
  // zero empty miles and undercounted a load's fuel, while the KPI beside it
  // refused the same input. It is a money file and belongs under the ratchet.
  "src/lib/metrics/fuel.ts",
  "src/lib/metrics/payWeeks.ts",
  "src/lib/pnl/parsePnl.ts",
  "src/hooks/useRateTargets.ts",
  "src/pages/CashFlowPage.tsx",
  "src/pages/ExpensesPage.tsx",
  "src/pages/LoadDetailPage.tsx",
  "src/pages/ScoreLoadPage.tsx",
  // Added v1.268.0 (C2a): the Plan page moved money and sat outside the
  // ratchet while its sibling Cash Flow sat inside. Two bare
  // `.catch(() => {})` swallowed the whole page load, so a dead request
  // rendered "NO SNAPSHOT YET" — a confident claim built out of nothing.
  "src/pages/StatusPage.tsx",
];

// Fixed substrings, so the count is reproducible with grep -F.
//
// `Math.max(0,` was TRIED here in v1.268.0 and rejected, which is worth
// recording so nobody tries it twice. The bug that prompted it was real —
// `leftover = Math.max(0, advances - spent)` erased four statements of fuel
// overspend as $0 — but the pattern caught **41 lines across the money files**
// and all but one were correct: a distance to a floor (`Math.max(0, f - v)`),
// a percentage clamp (`Math.min(1, Math.max(0, v / f))`), a week count, a
// parser depth. Floors at zero are the right idiom for a distance or a ratio.
// A ratchet that must allowlist forty correct lines to catch one wrong one
// teaches nothing and dilutes the list it is supposed to shrink. The real
// rule — a signed cash movement must stay signed — is pinned where it belongs,
// as a case in cashBoard.test.ts.
const PATTERNS = ["?? 0", "|| 0", "|| 2000", "?? 70", ".catch(() => {})"];

type Hit = { file: string; line: number; text: string };

const hits = (): Hit[] => {
  const out: Hit[] = [];
  for (const file of FILES) {
    const src = readFileSync(resolve(process.cwd(), file), "utf8").split("\n");
    src.forEach((raw, i) => {
      if (PATTERNS.some((p) => raw.includes(p))) out.push({ file, line: i + 1, text: raw.trim() });
    });
  }
  return out;
};

const key = (file: string, text: string) => `${file}\u0000${text}`;
const tally = (items: { file: string; text: string }[]) => {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it.file, it.text), (m.get(key(it.file, it.text)) ?? 0) + 1);
  return m;
};

describe("silent-zero ratchet · money files", () => {
  const found = hits();
  const listed = tally(allowlist.lines);
  const actual = tally(found);

  it("every silent-zero line is in the allowlist (a new one fails)", () => {
    const unlisted: string[] = [];
    const seen = new Map<string, number>();
    for (const h of found) {
      const k = key(h.file, h.text);
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      if (n > (listed.get(k) ?? 0))
        unlisted.push(`${h.file}:${h.line}  ${h.text}`);
    }
    expect(
      unlisted,
      `New silent zero(s) in a money file. Refuse the missing input and say what is missing instead of defaulting it, or list the line in silent-zero-allowlist.json with an honest reason:\n${unlisted.join("\n")}`,
    ).toEqual([]);
  });

  it("the count only falls: at most `max` lines", () => {
    expect(found.length).toBeLessThanOrEqual(allowlist.max);
    expect(allowlist.lines.length).toBeLessThanOrEqual(allowlist.max);
  });

  it("every allowlist entry still exists (a retired line must be removed from the list)", () => {
    const stale: string[] = [];
    for (const [k, n] of listed) {
      if ((actual.get(k) ?? 0) < n) stale.push(k.replace("\u0000", "  "));
    }
    expect(
      stale,
      `These allowlist entries no longer match a line — delete them and lower \`max\`:\n${stale.join("\n")}`,
    ).toEqual([]);
  });

  it("every entry carries a reason", () => {
    for (const e of allowlist.lines) expect(e.why.trim().length).toBeGreaterThan(10);
  });
});
