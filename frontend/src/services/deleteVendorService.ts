import api from "./api";
import { AxiosError } from "axios";
import type { Vendor } from "@/types/vendor";

export const deleteVendor = async (vendor_id: string): Promise<Vendor> => {
  try {
    const response = await api.delete(`/vendors/${vendor_id}`);
    return response.data.vendor;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error("Unable to delete vendor");
  }
};
