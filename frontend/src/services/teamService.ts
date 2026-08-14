import api from "./api";

export interface TeamMember {
  user_id: string;
  email: string;
  role: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

// The account's team (owner + dispatchers). Admin only — 403 otherwise.
export const getTeam = async (): Promise<TeamMember[]> => {
  const res = await api.get("/users");
  return res.data.team;
};

// One account member's identity, for their dispatcher card/page. A user may
// fetch their own; an admin may fetch any member of the account.
export const getUser = async (id: string): Promise<TeamMember> => {
  const res = await api.get(`/users/${id}`);
  return res.data.user;
};

// Set your OWN display name (owner or dispatcher). Shown as the booker on loads
// and anywhere the app credits you, in place of your email.
export const updateMyName = async (display_name: string): Promise<void> => {
  await api.patch("/users/me", { display_name });
};

export const createDispatcher = async (data: {
  email: string;
  password: string;
  display_name: string;
}): Promise<TeamMember> => {
  const res = await api.post("/users", data);
  return res.data.user;
};
