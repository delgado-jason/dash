import api from "./api";
import { loadSaveErrorFrom } from "@/lib/loads/loadSaveError";
import type { Load } from "@/types/load";
import type { CustomerEnd } from "@/lib/loads/customerEnd";
import { withCustomerEnd } from "./loadsService";

interface PatchLoadInput {
  load_status?: string;
  payment_status?: string;
  booked_by?: string | null;
  detention_paid?: boolean;
  tonu_paid?: boolean;
  detention_billable?: boolean | null;
  // Decision 4 (073): an OS&D / damage claim — breaks the agent's streak.
  claim_filed?: boolean;
  // Decision 5A (074): whose customer this load is — the mark every footprint
  // reader follows. Only ever set by a person.
  customer_end?: CustomerEnd;
}

export const patchLoad = async (
  load_id: string,
  data: PatchLoadInput,
): Promise<Load> => {
  try {
    const response = await api.patch(`/loads/${load_id}`, data);
    return withCustomerEnd(response.data.load);
  } catch (error) {
    // Surface the backend's own sentence AND its details, so the load page can
    // say "Validation failed — customer_end must be one of shipper, receiver,
    // neither" instead of a flat "Unable to patch load" — the same shape
    // patchAgentService uses. The claim toggle reads by name now too.
    const refused = loadSaveErrorFrom(error);
    if (refused) throw refused;
    throw new Error("Unable to patch load");
  }
};
