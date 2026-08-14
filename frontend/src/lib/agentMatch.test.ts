import { describe, it, expect } from "vitest";
import type { Agent } from "@/types/agent";
import { matchAgents, agentLabel, agentCode, agentFullName } from "./agentMatch";

const mk = (id: string, code: string, first: string, last: string): Agent => ({
  agent_id: id,
  broker_id: "b",
  broker_name: code,
  first_name: first,
  last_name: last,
  preferred_contact: "phone",
  created_at: "",
  updated_at: "",
});

const roster = [
  mk("1", "EWT", "Danielle", "Carder"),
  mk("2", "EWT", "Erica", "Kohout"),
  mk("3", "JVL", "Charlie", "Miltner"),
  mk("4", "ROS", "Jennifer", "Heggen"),
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
});
