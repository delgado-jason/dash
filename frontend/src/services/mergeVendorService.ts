import api from "./api";
import { AxiosError } from "axios";
import type { Vendor } from "@/types/vendor";

// The merge hands back the vendor with its spend already re-counted, plus how
// many log rows were rewritten to its name.
export const mergeIntoVendor = async (
  vendor_id: string,
  name: string,
): Promise<{ vendor: Vendor; rewritten: number }> => {
  try {
    const response = await api.post(`/vendors/${vendor_id}/merge`, { name });
    return { vendor: response.data.vendor, rewritten: response.data.rewritten };
  } catch (error) {
    if (error instanceof AxiosError && error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error("Unable to merge that name");
  }
};

// Undo a merge. The alias goes; the log rows keep the canonical name.
export const removeVendorAlias = async (
  vendor_id: string,
  alias: string,
): Promise<Vendor> => {
  try {
    const response = await api.delete(
      `/vendors/${vendor_id}/aliases/${encodeURIComponent(alias)}`,
    );
    return response.data.vendor;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error("Unable to drop that alias");
  }
};
