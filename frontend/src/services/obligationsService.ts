import api from "./api";
import type { Obligation } from "@/types/obligation";

/* eslint-disable @typescript-eslint/no-explicit-any */
const coerce = (o: any): Obligation => ({
  obligation_id: o.obligation_id,
  label: o.label,
  amount: Number(o.amount),
  active: o.active,
  is_draw: o.is_draw ?? false,
  original_balance: o.original_balance != null ? Number(o.original_balance) : null,
  current_balance: o.current_balance != null ? Number(o.current_balance) : null,
  balance_as_of: o.balance_as_of ?? null,
  payoff_date: o.payoff_date ?? null,
  asset_type: o.asset_type ?? null,
  asset_id: o.asset_id ?? null,
});

// The payoff fields a create/patch may set on a loan-type obligation.
export interface PayoffInput {
  original_balance: number | null;
  current_balance: number | null;
  balance_as_of: string | null;
  payoff_date: string | null;
  asset_type: string | null;
  asset_id: string | null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const getObligations = async (): Promise<Obligation[]> => {
  try {
    const res = await api.get("/obligations");
    return res.data.obligations.map(coerce);
  } catch {
    throw new Error("Unable to fetch obligations");
  }
};

export const createObligation = async (data: {
  label: string;
  amount: number;
  is_draw?: boolean;
}): Promise<Obligation> => {
  try {
    const res = await api.post("/obligations", data);
    return coerce(res.data.obligation);
  } catch {
    throw new Error("Unable to add the obligation");
  }
};

export const patchObligation = async (
  id: string,
  data: Partial<
    { label: string; amount: number; active: boolean; is_draw: boolean } & PayoffInput
  >,
): Promise<void> => {
  try {
    await api.patch(`/obligations/${id}`, data);
  } catch {
    throw new Error("Unable to update the obligation");
  }
};

export const deleteObligation = async (id: string): Promise<void> => {
  try {
    await api.delete(`/obligations/${id}`);
  } catch {
    throw new Error("Unable to delete the obligation");
  }
};
