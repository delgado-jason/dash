import { describe, it, expect } from "vitest";
import {
  monthWord,
  prospectingOpener,
  prospectingVoicemail,
  reactivationOpener,
  reactivationVoicemail,
  type ScriptContext,
} from "./callScripts";

const full: ScriptContext = {
  agentFirst: "Harrison",
  caller: "Brandie",
  lastLoad: { commodity: "transformer", loadType: "oversize", origin: "Benson, AZ", destination: "Tulsa, OK", month: "July" },
  market: "Benson, AZ",
  phone: "(918) 555-0142",
};

describe("call scripts — brackets filled from the record", () => {
  it("the reactivation opener names the agent, the caller, the lane and the month", () => {
    const s = reactivationOpener(full);
    expect(s).toContain("Hi Harrison, this is Brandie with Delgado Trucking Services.");
    expect(s).toContain("We hauled transformer Benson, AZ → Tulsa, OK for you back in July.");
    expect(s).not.toContain("[");
  });

  it("falls back to the load type when the commodity is blank, and to [brackets] when nothing is known", () => {
    const s = reactivationOpener({ ...full, lastLoad: { ...full.lastLoad!, commodity: "  " } });
    expect(s).toContain("We hauled oversize Benson, AZ → Tulsa, OK");
    const bare = reactivationOpener({ agentFirst: "", caller: null, lastLoad: null, market: null, phone: null });
    expect(bare).toContain("Hi [Agent], this is [Name]");
    expect(bare).toContain("We hauled [commodity / lane] for you back in [month].");
  });

  it("the prospecting opener leads with capacity and the market; the voicemails carry the callback number", () => {
    expect(prospectingOpener(full)).toContain("I've seen you move freight out of Benson, AZ");
    expect(prospectingOpener({ ...full, market: null })).toContain("out of [city / market]");
    expect(reactivationVoicemail(full)).toContain("reach me at (918) 555-0142");
    expect(prospectingVoicemail({ ...full, phone: null })).toContain("Reach me at [number] any time");
  });

  it("monthWord reads the month off a DATE key in UTC — no day-shift", () => {
    expect(monthWord("2026-07-01")).toBe("July");
    expect(monthWord("2026-12-31T05:00:00.000Z")).toBe("December");
    expect(monthWord(null)).toBeNull();
  });
});
