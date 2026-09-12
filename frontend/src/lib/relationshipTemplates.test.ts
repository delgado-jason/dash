import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { EmptyNext } from "./relationships/capacityList";
import {
  capacityDraft150,
  capacityText150,
  closeOutDraft,
  draftText,
  holidayDraft,
  milestoneDraft,
  milestoneSentence,
  signerWord,
} from "./relationshipTemplates";

const guy = { first_name: "Guy" };
// The three answers to "when are you empty?" — a committed load with a
// delivery day, nothing committed (sitting empty now), a committed load with
// no delivery date on file yet.
const walkerFriday: EmptyNext = { city: "Walker", state: "MI", source: "committed", dayKey: "2026-09-18", time: "14:00:00" };
const walkerNow: EmptyNext = { city: "Walker", state: "MI", source: "last-delivered", dayKey: "2026-09-11", time: null };
const walkerUnscheduled: EmptyNext = { city: "Walker", state: "MI", source: "committed", dayKey: null, time: null };

describe("the signer — whoever is logged in, never a typed name", () => {
  it("uses the display name; with none on file the SOP's [Name] bracket stays", () => {
    expect(signerWord("Brandie")).toBe("Brandie");
    expect(signerWord("  ")).toBe("[Name]");
    expect(signerWord(null)).toBe("[Name]");
  });
});

describe("① capacity heads-up within 150 mi", () => {
  it("fills the §7 script: agent, signer, place, day/time, miles rounded to ten", () => {
    const d = capacityDraft150(guy, walkerFriday, 141, "Brandie");
    expect(d.body).toContain("Morning Guy — Brandie at Delgado Trucking. We'll be empty Walker, MI Friday 2pm, within about 140 miles of your freight. Open to anything working out of there. Anything I can look at?");
    expect(d.body.endsWith("— Brandie · Delgado Trucking")).toBe(true);
    expect(d.subject).toBe("Going empty Walker, MI Friday 2pm — about 140 miles from your freight");
  });

  it("already empty (nothing committed) → present tense", () => {
    const d = capacityDraft150(guy, walkerNow, 126, null);
    expect(d.body).toContain("[Name] at Delgado Trucking. We're empty Walker, MI now, within about 130 miles");
    expect(d.subject).toBe("Empty Walker, MI now — about 130 miles from your freight");
  });

  it("a committed load with no delivery date yet → 'after our next drop', never 'now' — the truck is loaded", () => {
    const d = capacityDraft150(guy, walkerUnscheduled, 141, "Brandie");
    expect(d.body).toContain("We'll be empty Walker, MI after our next drop, within about 140 miles of your freight.");
    expect(d.subject).toBe("Going empty Walker, MI after our next drop — about 140 miles from your freight");
    expect(d.body).not.toMatch(/\bnow\b/);
    expect(d.subject).not.toMatch(/\bnow\b/);
  });

  it("a folded reason rides on the same message", () => {
    const d = capacityDraft150(guy, walkerFriday, 141, "Brandie", milestoneSentence("loads", 5));
    expect(d.body).toContain("Anything I can look at?\n\nAlso — that was our 5th load together.");
  });

  it("the text variant fits one screen, in every tense", () => {
    const t = capacityText150(guy, walkerFriday, 141, "Brandie");
    expect(t).toBe("Morning Guy — Brandie, Delgado Trucking. Empty Walker, MI Fri 2pm, ~140 mi from your freight. Anything working out of there I can look at?");
    expect(t.length).toBeLessThanOrEqual(160);
    expect(capacityText150(guy, walkerNow, 141, null)).toContain("Empty Walker, MI now, ~140 mi");
    const tbd = capacityText150(guy, walkerUnscheduled, 141, "Brandie");
    expect(tbd).toContain("Empty Walker, MI after our next drop, ~140 mi");
    expect(tbd).not.toMatch(/\bnow\b/);
    expect(tbd.length).toBeLessThanOrEqual(160);
  });
});

describe("② milestone", () => {
  it("load count, streak and anniversary say what the SOP says", () => {
    expect(milestoneSentence("loads", 10)).toBe("that was our 10th load together. Appreciate you keeping us busy; here's to the next ten.");
    expect(milestoneSentence("loads", 25)).toContain("25th load together");
    expect(milestoneSentence("streak", 20)).toBe("that's 20 straight for you, all on time and claim-free. That's the whole idea over here. Thanks for the trust.");
    expect(milestoneSentence("anniversary", 2026, 1)).toBe("a year ago this week we ran our first load for you. Glad to still be on your list.");
    expect(milestoneSentence("anniversary", 2027, 2)).toContain("2 years ago this week");
  });

  it("the draft is addressed and signed", () => {
    const d = milestoneDraft("loads", 5, { first_name: "Mike" }, "Brandie");
    expect(d.subject).toBe("Our 5th load together");
    expect(d.body).toBe("Mike — that was our 5th load together. Appreciate you keeping us busy; here's to the next five.\n\n— Brandie · Delgado Trucking");
    expect(milestoneDraft("streak", 10, guy, null).subject).toBe("10 straight, on time and claim-free");
    expect(milestoneDraft("anniversary", 2026, guy, null, 1).subject).toBe("A year since our first load");
  });
});

describe("③ holiday", () => {
  it("Thanksgiving carries no ask; New Year names the year", () => {
    expect(holidayDraft("thanksgiving", guy, "Jason", 2026).body).toBe(
      "Guy — Happy Thanksgiving from Delgado Trucking. Genuinely thankful for your business this year. No ask — just wanted to say it.\n\n— Jason · Delgado Trucking",
    );
    const ny = holidayDraft("newyear", guy, null, 2027);
    expect(ny.subject).toBe("Happy New Year from Delgado Trucking");
    expect(ny.body).toContain("Looking forward to running for you in 2027.");
  });
});

describe("the close-out — operational, signed by the person on shift", () => {
  const load = (o: Partial<Load>): Load =>
    ({ load_id: "l", load_number: "5597013", load_status: "delivered", origin_city: "Vicksburg", destination_city: "Walker", destination_state: "MI", delivery_date: "2026-09-11", ...o }) as unknown as Load;

  it("names the load and the next empty point, and signs with the signer", () => {
    const d = closeOutDraft(load({}), [load({}), load({ load_id: "b", load_status: "booked", destination_city: "Toledo", destination_state: "OH", delivery_date: "2026-09-18", delivery_appt_start: "14:00:00" })], "Brandie");
    expect(d.subject).toBe("Delivered — 5597013, Vicksburg → Walker");
    expect(d.body).toBe("Delivered and signed clean, no OS&D. Appreciate the freight. We'll be empty Toledo, OH Friday 2pm if anything's moving.\n\n— Brandie · Delgado Trucking");
  });

  it("nothing committed → already empty at the drop; no loads at all → no empty line", () => {
    expect(closeOutDraft(load({}), [load({})], null).body).toContain("We're empty Walker, MI now if anything's moving.\n\n— [Name]");
    expect(closeOutDraft(load({}), [], null).body).toBe("Delivered and signed clean, no OS&D. Appreciate the freight.\n\n— [Name] · Delgado Trucking");
    expect(draftText({ subject: "S", body: "B" })).toBe("S\n\nB");
  });

  it("a committed load with no delivery date yet → 'after our next drop', not 'now'", () => {
    const booked = load({ load_id: "b", load_status: "booked", destination_city: "Toledo", destination_state: "OH", pickup_date: "2026-09-16", delivery_date: null });
    const d = closeOutDraft(load({}), [load({}), booked], "Brandie");
    expect(d.body).toBe("Delivered and signed clean, no OS&D. Appreciate the freight. We'll be empty Toledo, OH after our next drop if anything's moving.\n\n— Brandie · Delgado Trucking");
  });
});
