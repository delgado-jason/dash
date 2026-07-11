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

// Generate a preview image (fal) for a trophy or the hall background. Returns the
// stored preview URL — not attached until you approve it via upsertTrophy.
export const generateTrophyImage = async (
  key: string,
  prompt: string,
  wide = false,
): Promise<string> => {
  const res = await api.post(`/trophies/${key}/generate`, { prompt, wide });
  return res.data.image_url;
};
