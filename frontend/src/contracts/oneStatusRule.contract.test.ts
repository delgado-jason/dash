// The one-status-rule ratchet (added v1.267.1 · C1a).
//
// `lib/metrics/status.ts` owns the ONE definition of what a load's status
// means, and its own header says so:
//
//   "Nothing else in src/ may spell `load_status === "delivered"` or build its
//    own cancelled/tonu set — import these (a contract greps for it)."
//
// No contract grepped for it. That is how `loadsViewTotals` came to hand-roll
// `load_status !== "tonu"` — a NARROWER never-revenue set than the house one —
// and count eight cancelled loads, $27,530 of freight that never moved, into
// the Loads page's gross (fixed in this same change).
//
// So here is the grep the comment promised. It watches the MONEY ENGINES only:
// a page filtering its own table by status is legitimate UI, but an engine
// that computes a figure should be asking `isDelivered` / `isNeverRevenue`,
// not spelling the statuses itself.
//
// The list below is DEBT, not endorsement: every entry is a pre-existing
// hand-rolled status test that C1a did not examine. Several are probably
// correct (a cancelled-only rule is not always a never-revenue rule), but each
// one is a place the house definition could drift. The list can only shrink:
// convert a call site to the helper, delete its entry. A NEW unlisted line
// fails.
//
// Rule-change gate: adding to this list is a deliberate change and needs a
// 'Rule change: <id>' line in the PR body.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = "src/lib/metrics";
const OWNER = "status.ts"; // the one file allowed to spell them

// A load-status comparison against a never-revenue value. Trip statuses
// (`t.status === "cancelled"`) are a different field and are not matched.
const isStatusSpelling = (line: string): boolean => {
  const t = line.trim();
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return false;
  return t.includes("load_status") && (t.includes('"tonu"') || t.includes('"cancelled"'));
};

// Pre-existing call sites, as found on 2026-11-09. Shrink this list; never grow it.
const ALLOWED: Record<string, number> = {
  "agent.ts": 1,
  "agentScorecard.ts": 1,
  "apuHours.ts": 1,
  "facilityLedger.ts": 1,
  "foreman.ts": 2,
  "odometer.ts": 1,
  "perDay.ts": 1,
  "relationships.ts": 1,
};

describe("one-status-rule ratchet · the money engines", () => {
  const found: Record<string, { line: number; text: string }[]> = {};
  for (const name of readdirSync(resolve(process.cwd(), DIR))) {
    if (!name.endsWith(".ts") || name.endsWith(".test.ts") || name === OWNER) continue;
    const src = readFileSync(resolve(process.cwd(), DIR, name), "utf8").split("\n");
    src.forEach((raw, i) => {
      if (isStatusSpelling(raw)) (found[name] ??= []).push({ line: i + 1, text: raw.trim() });
    });
  }

  it("no engine spells its own cancelled/tonu set beyond the known debt", () => {
    const over: string[] = [];
    for (const [file, hits] of Object.entries(found)) {
      const allowed = ALLOWED[file] ?? 0;
      if (hits.length > allowed)
        for (const h of hits.slice(allowed))
          over.push(`${DIR}/${file}:${h.line}  ${h.text}`);
    }
    expect(
      over,
      `A money engine is spelling a load status itself. Import isDelivered / isNeverRevenue from metrics/status.ts — it owns the one definition, and a narrower copy is how cancelled freight got counted as gross:\n${over.join("\n")}`,
    ).toEqual([]);
  });

  it("every allowlisted call site still exists (a converted one must be removed)", () => {
    const stale = Object.entries(ALLOWED)
      .filter(([file, n]) => (found[file]?.length ?? 0) < n)
      .map(([file, n]) => `${file}: listed ${n}, found ${found[file]?.length ?? 0}`);
    expect(
      stale,
      `These entries no longer match — the debt shrank, so shrink the list:\n${stale.join("\n")}`,
    ).toEqual([]);
  });

  it("loadsViewTotals uses the house helper, not its own set", () => {
    // The specific regression this ratchet was born from.
    const src = readFileSync(resolve(process.cwd(), DIR, "loads.ts"), "utf8");
    expect(src).toContain("isNeverRevenue");
  });
});
