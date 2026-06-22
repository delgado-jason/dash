import type { AgentNote } from "./agentNote";
import type { AgentRatingHistory } from "./agentRatingHistory";

export type TimelineEvent =
  | { type: "note"; timestamp: string; data: AgentNote }
  | { type: "rating"; timestamp: string; data: AgentRatingHistory };
