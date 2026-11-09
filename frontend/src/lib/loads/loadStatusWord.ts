// The one word a load's status and payment resolve to on its page — paid wins
// over delivered; a cancelled load or a TONU says so; anything else says
// nothing. Pure; the renderer is components/ui/StatusWord.
export type LoadStatusWord = "paid" | "delivered" | "cancelled" | "tonu";

export const loadStatusWord = (
  loadStatus: string,
  paymentStatus: string,
): LoadStatusWord | null => {
  if (paymentStatus === "paid") return "paid";
  if (loadStatus === "delivered") return "delivered";
  if (loadStatus === "cancelled") return "cancelled";
  if (loadStatus === "tonu") return "tonu";
  return null;
};
