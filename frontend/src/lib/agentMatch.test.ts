import { describe, it, expect } from "vitest";
import type { Agent } from "@/types/agent";
import { matchAgents, agentLabel, agentCode, agentFullName } from "./agentMatch";
import { codeOf } from "@/lib/agencies/codeOf";

const mk = (
  id: string,
  code: string,
  first: string,
  last: string,
  posting_code: string | null = null,
): Agent => ({
  agent_id: id,
  agency_id: "b",
  agency_code: code,
  agency_name: null,
  posting_code,
  first_name: first,
  last_name: last,
  preferred_contact: "phone",
  relationship_tier: null, // v2: no owner-set tier — a Prospect; the matcher never reads it
  created_at: "",
  updated_at: "",
});

const roster = [
  mk("1", "EWT", "Danielle", "Carder"),
  mk("2", "EWT", "Erica", "Kohout"),
  mk("3", "JVL", "Charlie", "Miltner"),
  mk("4", "ROS", "Jennifer", "Heggen"),
  // Eric Hesketh posts MAM out of Central Pennsylvania Logistics (CPL) — the
  // code he wears is HIS, not the desk's.
  mk("5", "CPL", "Eric", "Hesketh", "MAM"),
];

describe("agentMatch", () => {
  it("matches by 3-letter code prefix, surfacing every agent under it", () => {
    expect(matchAgents(roster, "EWT").map((a) => a.agent_id).sort()).toEqual(["1", "2"]);
  });

  it("narrows by person name (case-insensitive)", () => {
    expect(matchAgents(roster, "erica").map((a) => a.agent_id)).toEqual(["2"]);
    expect(matchAgents(roster, "Heggen").map((a) => a.agent_id)).toEqual(["4"]);
    expect(matchAgents(roster, "jvl").map((a) => a.agent_id)).toEqual(["3"]);
  });

  it("is empty for a blank query", () => {
    expect(matchAgents(roster, "")).toEqual([]);
    expect(matchAgents(roster, "   ")).toEqual([]);
  });

  it("returns nothing for an unknown code or name (→ flags a new agent)", () => {
    expect(matchAgents(roster, "XYZ")).toEqual([]);
    expect(matchAgents(roster, "Nobody")).toEqual([]);
  });

  it("labels as CODE · Name", () => {
    expect(agentLabel(roster[0])).toBe("EWT · Danielle Carder");
    expect(agentCode(roster[0])).toBe("EWT");
    expect(agentFullName(roster[0])).toBe("Danielle Carder");
  });

  it("wears the agent's OWN posting code when it differs from the agency's", () => {
    const eric = roster[4];
    expect(codeOf(eric)).toEqual({ code: "MAM", kind: "posting" });
    expect(agentCode(eric)).toBe("MAM");
    expect(agentLabel(eric)).toBe("MAM · Eric Hesketh");
    // …and he is found by the code he posts under, not only the desk's.
    expect(matchAgents(roster, "MAM").map((a) => a.agent_id)).toEqual(["5"]);
  });
});
