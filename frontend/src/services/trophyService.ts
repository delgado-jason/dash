import api from "./api";
import type { Trophy, TrophyInput } from "@/types/trophy";

export const getTrophies = async (): Promise<Trophy[]> => {
  const res = await api.get("/trophies");
  return res.data.trophies;
};

// Mark earned, set the earned-on date, or attach approved AI art.
export const upsertTrophy = async (
  key: string,
  data: TrophyInput,
): Promise<Trophy> => {
  const res = await api.put(`/trophies/${key}`, data);
  return res.data.trophy;
};

export const deleteTrophy = async (key: string): Promise<void> => {
  await api.delete(`/trophies/${key}`);
};
