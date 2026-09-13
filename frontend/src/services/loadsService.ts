import api from "./api";
import type { Load } from "@/types/load";
import { customerEndOf } from "@/lib/loads/customerEnd";

// Decision 5A (074): a row written before the column existed — or served from
// a stale cache — carries no customer_end. Coerce it once, here, so every
// reader downstream sees the same three values and an old load keeps reading
// exactly as it did: the origin is the agent's market.
export const withCustomerEnd = (load: Load): Load => ({
  ...load,
  customer_end: customerEndOf(load),
});

export const getLoads = async (): Promise<Load[]> => {
  try {
    const response = await api.get("/loads");
    return (response.data.loads as Load[]).map(withCustomerEnd);
  } catch {
    throw new Error("Unable to fetch loads");
  }
};
