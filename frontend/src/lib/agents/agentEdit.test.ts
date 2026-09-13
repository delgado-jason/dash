import { describe, it, expect } from "vitest";
import type { Agent } from "@/types/agent";
import {
  PREFERRED,
  draftFromAgent,
  validateDraft,
  buildAgentPatch,
  type AgentEditDraft,
} from "./agentEdit";

const agent: Agent = {
  agent_id: "a1",
  agency_id: "b1",
  agency_code: "EWT",
  agency_name: null,
  posting_code: null,
  first_name: "Dana",
  last_name: "Ruiz",
  phone: "(918) 555-0100",
  email: "dana@ewt.com",
  preferred_contact: "phone",
  rating: 4,
  notes: "Runs the yard herself.",
  relationship_tier: 1,
  tier_set_at: "2026-09-01T00:00:00.000Z",
  agent_city: "Tulsa",
  agent_state: "OK",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const draft: AgentEditDraft = {
  first_name: "Dana",
  last_name: "Ruiz",
  agency_id: "b1",
  posting_code: "",
  agent_city: "Tulsa",
  agent_state: "OK",
  phone: "(918) 555-0100",
  email: "dana@ewt.com",
  preferred_contact: "phone",
};

describe("PREFERRED", () => {
  it("covers the three enum values with dispatcher-facing labels", () => {
    expect(PREFERRED.map((p) => p.value)).toEqual(["phone", "text", "email"]);
    expect(PREFERRED.map((p) => p.label)).toEqual(["Call", "Text", "Email"]);
  });
});

describe("draftFromAgent", () => {
  it("copies every editable field as a string", () => {
    expect(draftFromAgent(agent)).toEqual(draft);
  });

  it("maps null and missing optional fields to empty strings", () => {
    const sparse: Agent = {
      ...agent,
      phone: null,
      email: undefined,
      agent_city: null,
      agent_state: undefined,
    };
    const d = draftFromAgent(sparse);
    expect(d.phone).toBe("");
    expect(d.email).toBe("");
    expect(d.agent_city).toBe("");
    expect(d.agent_state).toBe("");
  });
});

describe("validateDraft", () => {
  it("passes a complete draft", () => {
    expect(validateDraft(draft)).toBeNull();
  });

  it("passes when the optional fields are blank", () => {
    expect(
      validateDraft({ ...draft, phone: "", email: "", agent_city: "", agent_state: "" }),
    ).toBeNull();
  });

  it("requires a first name and a last name, ignoring whitespace", () => {
    expect(validateDraft({ ...draft, first_name: "   " })).toBe("First name is required.");
    expect(validateDraft({ ...draft, last_name: "" })).toBe("Last name is required.");
  });

  it("rejects a state that is not exactly two letters", () => {
    expect(validateDraft({ ...draft, agent_state: "Okla" })).toBe(
      "State should be the 2-letter code.",
    );
    expect(validateDraft({ ...draft, agent_state: "O1" })).toBe(
      "State should be the 2-letter code.",
    );
    expect(validateDraft({ ...draft, agent_state: "ok" })).toBeNull();
  });

  it("rejects an email with no @ or no dot, but never nags on a blank one", () => {
    expect(validateDraft({ ...draft, email: "dana.ewt.com" })).toBe(
      "That doesn't look like an email address.",
    );
    expect(validateDraft({ ...draft, email: "dana@ewt" })).toBe(
      "That doesn't look like an email address.",
    );
    expect(validateDraft({ ...draft, email: "" })).toBeNull();
  });

  it("caps names, phone and email at 50 and city at 100 characters", () => {
    const long51 = "x".repeat(51);
    expect(validateDraft({ ...draft, first_name: long51 })).toBe(
      "First name can't be longer than 50 characters.",
    );
    expect(validateDraft({ ...draft, last_name: long51 })).toBe(
      "Last name can't be longer than 50 characters.",
    );
    expect(validateDraft({ ...draft, phone: long51 })).toBe(
      "Phone can't be longer than 50 characters.",
    );
    expect(validateDraft({ ...draft, email: `${"x".repeat(45)}@a.com` })).toBe(
      "Email can't be longer than 50 characters.",
    );
    expect(validateDraft({ ...draft, agent_city: "c".repeat(101) })).toBe(
      "City can't be longer than 100 characters.",
    );
    expect(validateDraft({ ...draft, first_name: "x".repeat(50) })).toBeNull();
  });

  it("rejects an unknown preferred contact but lets a blank one through", () => {
    expect(validateDraft({ ...draft, preferred_contact: "fax" })).toBe(
      "Pick how they prefer to be reached.",
    );
    expect(validateDraft({ ...draft, preferred_contact: "text" })).toBeNull();
    expect(validateDraft({ ...draft, preferred_contact: "" })).toBeNull();
  });

  it("saves a city fix on a prospect nobody has asked a preference of yet", () => {
    const prospect = draftFromAgent({ ...agent, preferred_contact: null });
    expect(prospect.preferred_contact).toBe("");
    expect(validateDraft({ ...prospect, agent_city: "Broken Arrow" })).toBeNull();
  });
});

describe("validateDraft posting_code", () => {
  it("blank is fine — they post from the agency's desk", () => {
    expect(validateDraft({ ...draft, posting_code: "" })).toBeNull();
    expect(validateDraft({ ...draft, posting_code: "   " })).toBeNull();
  });

  it("takes three letters in either case", () => {
    expect(validateDraft({ ...draft, posting_code: "MAM" })).toBeNull();
    expect(validateDraft({ ...draft, posting_code: "cjy" })).toBeNull();
  });

  it("refuses anything that is not three letters", () => {
    for (const bad of ["MA", "MAMA", "M1M"]) {
      expect(validateDraft({ ...draft, posting_code: bad })).toBe(
        "A posting code is 3 letters — leave it blank if they post under the agency's.",
      );
    }
  });
});

describe("buildAgentPatch", () => {
  it("returns null when nothing changed", () => {
    expect(buildAgentPatch(agent, draft)).toBeNull();
  });

  it("includes only the fields that differ", () => {
    expect(buildAgentPatch(agent, { ...draft, agent_city: "Broken Arrow" })).toEqual({
      agent_city: "Broken Arrow",
    });
    expect(
      buildAgentPatch(agent, { ...draft, agency_id: "b2", preferred_contact: "text" }),
    ).toEqual({ agency_id: "b2", preferred_contact: "text" });
  });

  it("trims names and treats a whitespace-only change as no change", () => {
    expect(buildAgentPatch(agent, { ...draft, first_name: "  Dana " })).toBeNull();
    expect(buildAgentPatch(agent, { ...draft, last_name: " Ruiz-Ortega " })).toEqual({
      last_name: "Ruiz-Ortega",
    });
  });

  it("sends null to clear phone, email, city and state", () => {
    expect(
      buildAgentPatch(agent, { ...draft, phone: "", email: "  ", agent_city: "", agent_state: "" }),
    ).toEqual({ phone: null, email: null, agent_city: null, agent_state: null });
  });

  it("treats a blank draft field and a null row value as unchanged", () => {
    const sparse: Agent = { ...agent, phone: null, email: null, agent_city: null, agent_state: null };
    expect(
      buildAgentPatch(sparse, { ...draft, phone: "", email: "", agent_city: "", agent_state: "" }),
    ).toBeNull();
  });

  it("uppercases the state and compares case-insensitively", () => {
    expect(buildAgentPatch(agent, { ...draft, agent_state: "ok" })).toBeNull();
    expect(buildAgentPatch(agent, { ...draft, agent_state: "tx" })).toEqual({ agent_state: "TX" });
  });

  it("sends preferred_contact when the row never had one and a pick is made", () => {
    const unset: Agent = { ...agent, preferred_contact: null };
    expect(buildAgentPatch(unset, draft)).toEqual({ preferred_contact: "phone" });
  });

  it("leaves a null preferred_contact alone when the draft stays blank", () => {
    const prospect: Agent = { ...agent, preferred_contact: null };
    const blank = { ...draft, preferred_contact: "" };
    expect(buildAgentPatch(prospect, blank)).toBeNull();
    expect(buildAgentPatch(prospect, { ...blank, agent_city: "Broken Arrow" })).toEqual({
      agent_city: "Broken Arrow",
    });
  });

  it("sends the posting code uppercased, and null to clear it back to the desk", () => {
    // Eric Hesketh posts MAM out of CPL; blanking it puts him on the agency desk.
    expect(buildAgentPatch(agent, { ...draft, posting_code: "mam" })).toEqual({
      posting_code: "MAM",
    });
    const coded: Agent = { ...agent, posting_code: "MAM" };
    expect(buildAgentPatch(coded, { ...draft, posting_code: "MAM" })).toBeNull();
    expect(buildAgentPatch(coded, { ...draft, posting_code: "  " })).toEqual({
      posting_code: null,
    });
  });

  it("never carries rating, tier, tier_set_at or notes, even when the agent has them", () => {
    const patch = buildAgentPatch(agent, {
      ...draft,
      first_name: "Dani",
      last_name: "R",
      agency_id: "b2",
      agent_city: "Austin",
      agent_state: "TX",
      phone: "",
      email: "dani@x.io",
      preferred_contact: "email",
    });
    expect(patch).not.toBeNull();
    expect(patch).not.toHaveProperty("rating");
    expect(patch).not.toHaveProperty("relationship_tier");
    expect(patch).not.toHaveProperty("tier_set_at");
    expect(patch).not.toHaveProperty("notes");
    expect(Object.keys(patch!).sort()).toEqual([
      "agency_id",
      "agent_city",
      "agent_state",
      "email",
      "first_name",
      "last_name",
      "phone",
      "preferred_contact",
    ]);
  });
});
