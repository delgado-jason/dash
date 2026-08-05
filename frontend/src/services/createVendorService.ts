import api from "./api";
import { AxiosError } from "axios";
import type { Vendor } from "@/types/vendor";
import type { CreateVendorInput } from "@/types/createVendorInput";

export const createVendor = async (
  data: CreateVendorInput,
): Promise<Vendor> => {
  try {
    const response = await api.post("/vendors", data);
    return response.data.vendor;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error("Unable to create new vendor");
  }
};
