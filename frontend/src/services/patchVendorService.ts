import api from "./api";
import { AxiosError } from "axios";
import type { Vendor } from "@/types/vendor";
import type { VendorPatchPayload } from "@/types/vendorPatchPayload";

export const patchVendor = async (
  vendor_id: string,
  data: VendorPatchPayload,
): Promise<Vendor> => {
  try {
    const response = await api.patch(`/vendors/${vendor_id}`, data);
    return response.data.vendor;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error("Unable to patch vendor");
  }
};
