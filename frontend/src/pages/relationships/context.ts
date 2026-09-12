import { useOutletContext } from "react-router-dom";
import type { RelationshipsData } from "@/hooks/useRelationshipsData";
import type { TouchPrefill } from "@/components/relationships/LogTouchForm";

// What the layout hands every view: the data, the clock, the role, and the
// three doors — open an agent's sheet, open + Prospect, show a toast.
export interface RelationshipsContext extends RelationshipsData {
  isAdmin: boolean;
  openAgent: (agentId: string, opts?: { prefill?: TouchPrefill }) => void;
  openProspect: () => void;
  notify: (message: string, action?: { label: string; run: () => void | Promise<void> }) => void;
}

export const useRelationships = () => useOutletContext<RelationshipsContext>();
