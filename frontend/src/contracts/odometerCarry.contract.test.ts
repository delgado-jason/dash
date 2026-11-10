// THE ODOMETER CARRY — a fill is never the start of the next load.
//
// Jason, 2026-11-10, on the carry-over rule: "That's an absolute must."
//
// The odometer is the single source of truth for deadhead, the cost basis, the
// accrual and the Scorer's grade. A start that is a few hundred miles low does
// not announce itself — it lands in deadhead and stays there. So the rule gets
// a contract rather than only a unit test:
//
//   1. `nextLoadStart` reads LOADS and TRIPS. Fuel and shop readings are not
//      arguments to it, so they can never reach it.
//   2. The load form uses `nextLoadStart`, never `getLatestOdometer` — the
//      trip form's helper, which takes GREATEST across loads, trips, FUEL and
//      services. On the day this was written that returned the Cisco fill at
//      612,828 while load 4493038 was still rolling from 612,773.
//   3. Jason's own Oct–Nov chain carries correctly, end to end.
//
// Rule-change gate: loosening any of these needs a 'Rule change: ODO-CARRY'
// line in the PR body.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { nextLoadStart } from "@/lib/metrics/odometerCarry";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";

const read = (f: string) => readFileSync(resolve(process.cwd(), f), "utf8");

describe("ODO-CARRY · the load form never carries from a fuel reading", () => {
  it("the load form imports nextLoadStart and NOT the GREATEST helper", () => {
    const form = read("src/components/LoadForm.tsx");
    expect(form).toMatch(/nextLoadStart/);
    // CODE lines only. The form carries a comment explaining why it does not
    // use `getLatestOdometer`, and that explanation is the most useful thing
    // on the subject — a grep that forced it out would be the tail wagging the
    // dog. Same reason oneStatusRule skips comments (v1.267.1).
    const code = form
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return t !== "" && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");
    expect(code).not.toMatch(/getLatestOdometer/);
  });

  it("the backend's GREATEST query still includes fuel — which is why the form must not use it", () => {
    // Pinning the reason, not just the rule. If this ever stops including
    // fuel_entries, the whole hazard changes and this contract should be
    // re-read rather than silently kept.
    const svc = read("../backend/src/services/tripServices.js");
    expect(svc).toMatch(/GREATEST/);
    expect(svc).toMatch(/fuel_entries/);
  });
});

describe("ODO-CARRY · Jason's real chain, Oct–Nov 2026", () => {
  // Read off prod on 2026-11-10. Every load and trip tiles exactly; the fills
  // all fall INSIDE runs and must never surface as a start.
  const L = (n: string, d: string, s: number, e: number | null, st = "delivered"): Load =>
    ({ load_number: n, load_status: st, delivery_date: d, odometer_start: s, odometer_end: e }) as unknown as Load;
  const T = (d: string, s: number, e: number): Trip =>
    ({ trip_date: d, status: "completed", trip_type: "deadhead", odometer_start: s, odometer_end: e }) as unknown as Trip;

  const loads = [
    L("1950883", "2026-10-06", 607330, 607756),
    L("2194005", "2026-10-08", 607756, 609537), // Knoxville fill 608,641 inside
    L("4036503", "2026-11-02", 610284, 611054),
    L("4115417", "2026-11-04", 611054, null, "tonu"), // turned up and left
    L("4333118", "2026-11-07", 611212, 612773), // Tuscaloosa fill 611,988 inside
  ];
  const trips = [
    T("2026-10-13", 609537, 610185),
    T("2026-10-19", 610185, 610231),
    T("2026-10-30", 610231, 610284),
    T("2026-11-03", 611054, 611212),
  ];

  it("carries from the last DELIVERY when a load ran last", () => {
    expect(nextLoadStart(loads, trips)).toMatchObject({
      reading: 612773, source: "load", ref: "4333118",
    });
  });

  it("carries from the TRIP when a trip ran last — Jason's rule, on his own data", () => {
    // Cut the book at Nov 3: the last movement is the deadhead home, and the
    // next load did in fact start at 611,212.
    const upTo = loads.filter((l) => (l.delivery_date ?? "") <= "2026-11-04");
    expect(nextLoadStart(upTo, trips)).toMatchObject({
      reading: 611212, source: "trip", ref: "2026-11-03",
    });
  });

  it("refuses while 4493038 is rolling, instead of reaching for the 612,828 fill", () => {
    const rolling = [...loads, L("4493038", "2026-11-10", 612773, null, "in_transit")];
    expect(nextLoadStart(rolling, trips)).toMatchObject({ reading: null, why: "rolling" });
  });

  it("the TONU's typed start never becomes a carry", () => {
    const upTo = loads.filter((l) => (l.delivery_date ?? "") <= "2026-11-04");
    // 4115417 carries odometer_start 611,054 and no end. The answer is the
    // trip's 611,212, not the dead run's start.
    expect(nextLoadStart(upTo, trips).reading).not.toBe(611054);
  });
});
