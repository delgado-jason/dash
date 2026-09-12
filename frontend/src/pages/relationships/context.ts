import { useOutletContext } from "react-router-dom";
import type { RelationshipsData } from "@/hooks/useRelationshipsData";
import type { TouchPrefill } from "@/components/relationships/LogTouchForm";
import type { TodayModel } from "@/lib/relationships/todayQueue";

// What the layout hands every view: the data, the clock, the role, the day's
// derived queue (built once, so the tab count and the Today view agree), and
// the three doors — open an agent's sheet, open + Prospect, show a toast.
export interface RelationshipsContext extends RelationshipsData {
  isAdmin: boolean;
  // null while the loads slice is missing — Today withholds rather than guess.
  today: TodayModel | null;
  openAgent: (agentId: string, opts?: { prefill?: TouchPrefill }) => void;
  openProspect: () => void;
  notify: (message: string, action?: { label: string; run: () => void | Promise<void> }) => void;
}

export const useRelationships = () => useOutletContext<RelationshipsContext>();
