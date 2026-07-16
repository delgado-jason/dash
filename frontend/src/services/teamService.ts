import api from "./api";

export interface TeamMember {
  user_id: string;
  email: string;
  role: string;
  display_name: string | null;
  created_at: string;
}

// The account's team (owner + dispatchers). Admin only — 403 otherwise.
export const getTeam = async (): Promise<TeamMember[]> => {
  const res = await api.get("/users");
  return res.data.team;
};

export const createDispatcher = async (data: {
  email: string;
  password: string;
  display_name: string;
}): Promise<TeamMember> => {
  const res = await api.post("/users", data);
  return res.data.user;
};
