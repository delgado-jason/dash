import api from "./api";
import type { Vendor } from "@/types/vendor";
import type { VendorRatingHistory } from "@/types/vendorRatingHistory";

interface GetVendorResponse {
  vendor: Vendor;
  ratingHistory: VendorRatingHistory[];
}

export const getVendor = async (
  vendor_id: string,
): Promise<GetVendorResponse> => {
  try {
    const response = await api.get(`/vendors/${vendor_id}`);
    return {
      vendor: response.data.vendor,
      ratingHistory: response.data.ratingHistory,
    };
  } catch {
    throw new Error("Unable to fetch vendor");
  }
};
