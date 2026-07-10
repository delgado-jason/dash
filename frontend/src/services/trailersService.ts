import api from "./api";
import type { Trailer } from "@/types/trailer";

export const getTrailers = async (): Promise<Trailer[]> => {
  const res = await api.get("/trailers/me");
  return res.data.trailers;
};

export const getTrailer = async (id: string): Promise<Trailer> => {
  const res = await api.get(`/trailers/me/${id}`);
  return res.data.trailer;
};

export const createTrailer = async (
  data: Record<string, unknown>,
): Promise<Trailer> => {
  const res = await api.post("/trailers/me", data);
  return res.data.trailer;
};
