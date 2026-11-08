import api from "./api";
import type { AccessorialRate } from "@/types/accessorialRate";

const coerce = (r: {
  accessorial_type: string;
  pay_pct: unknown;
  pass_through?: unknown;
}): AccessorialRate => ({
  accessorial_type: r.accessorial_type,
  pay_pct: Number(r.pay_pct),
  pass_through: r.pass_through === true,
});

export const getAccessorialRates = async (): Promise<AccessorialRate[]> => {
  const res = await api.get("/accessorial-rates");
  return (res.data.rates ?? []).map(coerce);
};

export const upsertAccessorialRate = async (
  accessorial_type: string,
  pay_pct: number,
  pass_through = false,
): Promise<AccessorialRate> => {
  const res = await api.put("/accessorial-rates", { accessorial_type, pay_pct, pass_through });
  return coerce(res.data.rate);
};

export const deleteAccessorialRate = async (
  accessorial_type: string,
): Promise<void> => {
  await api.delete(`/accessorial-rates/${encodeURIComponent(accessorial_type)}`);
};
