import api from "./api";
import { AxiosError } from "axios";
import type { DismissedShop } from "@/types/dismissedShop";

export const getDismissedVendors = async (): Promise<DismissedShop[]> => {
  try {
    const response = await api.get("/vendors/dismissed");
    return response.data.dismissed;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error("Unable to fetch dismissed one-off stops");
  }
};

// Wave a log name off the bridge. The API's own text is what the row shows —
// "“X” is a vendor already" reads better than anything invented here.
export const dismissVendor = async (name: string): Promise<DismissedShop> => {
  try {
    const response = await api.post("/vendors/dismissed", { name });
    return response.data.dismissal;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error("Unable to mark that as a one-off");
  }
};

export const restoreVendor = async (name: string): Promise<DismissedShop> => {
  try {
    const response = await api.post("/vendors/dismissed/restore", { name });
    return response.data.dismissal;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw new Error("Unable to put that back on the list");
  }
};
