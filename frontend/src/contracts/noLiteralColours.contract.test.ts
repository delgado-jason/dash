// The literal-colour ratchet (The Redesign, phase A2, 2026-11-08).
//
// dash has two looks from one token set: every `--color-*` token switches with
// the theme, so a colour typed as a literal (`#f5b03a`, `rgba(0,0,0,.5)`) is
// the one thing that stays a night colour on a daylight page. This contract
// counts them across src/**/*.{ts,tsx} (tests excluded) and refuses a count
// above `max` in literal-colours-allowlist.json. The list can only shrink:
// sweep a file, lower `max`. Files the phase B deletion removes are excluded
// by path, with a reason each; so is one data palette.
//
// Rule-change gate: raising `max` or adding an exclusion is a deliberate
// change and needs a 'Rule change: <id>' line in the PR body.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import allow from "./literal-colours-allowlist.json";

const SRC = resolve(process.cwd(), "src");
const LITERAL = /#[0-9a-fA-F]{6}\b|rgba?\([^)]*\)/g;

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
};

const rel = (p: string): string => relative(SRC, p).split(sep).join("/");
const excluded = (r: string): boolean =>
  allow.excluded.some((e) => (e.endsWith("/") ? r.startsWith(e) : r === e));

type Count = { file: string; n: number };
const counts = (): Count[] =>
  walk(SRC)
    .map((p) => ({ file: rel(p), n: (readFileSync(p, "utf8").match(LITERAL) ?? []).length }))
    .filter((c) => c.n > 0 && !excluded(c.file))
    .sort((a, b) => b.n - a.n);

describe("the literal-colour ratchet", () => {
  it(`counts at most ${allow.max} literal colours outside the excluded files`, () => {
    const all = counts();
    const total = all.reduce((s, c) => s + c.n, 0);
    const where = all.slice(0, 12).map((c) => `${c.n.toString().padStart(4)}  ${c.file}`).join("\n");
    expect(total, `literal colours found: ${total} (max ${allow.max}). Heaviest files:\n${where}`).toBeLessThanOrEqual(allow.max);
  });

  it("every exclusion has a reason", () => {
    for (const e of allow.excluded) {
      expect(typeof (allow.reasons as Record<string, string>)[e], `no reason for ${e}`).toBe("string");
    }
  });
});
