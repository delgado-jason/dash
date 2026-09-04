import type { AgentNote } from "./agentNote";
import type { AgentRatingHistory } from "./agentRatingHistory";

import type { AgentContact } from "@/services/agentContactsService";

export type TimelineEvent =
  | { type: "note"; timestamp: string; data: AgentNote }
  | { type: "rating"; timestamp: string; data: AgentRatingHistory }
  | { type: "touch"; timestamp: string; data: AgentContact };
