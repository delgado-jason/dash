import api from "./api";

export type AvatarKind = "truck" | "driver" | "trailer" | "user";

// Generate a themed avatar server-side (fal → Supabase Storage). `variant` is
// the driver gender ('male' | 'female'); ignored for truck/trailer.
export const generateAvatar = async (
  kind: AvatarKind,
  id: string,
  variant?: string,
): Promise<string> => {
  const res = await api.post(
    `/avatars/${kind}/${id}/generate`,
    variant ? { variant } : {},
  );
  return res.data.avatar_url as string;
};

// Upload a photo to override the avatar (raw image body).
export const uploadAvatar = async (
  kind: AvatarKind,
  id: string,
  file: File,
): Promise<string> => {
  const res = await api.post(`/avatars/${kind}/${id}/upload`, file, {
    headers: { "Content-Type": file.type },
  });
  return res.data.avatar_url as string;
};
