import { falGenerate, uploadToStorage } from "./avatarService.js";
import { isTrophyKey } from "../utils/validation/trophyValidation.js";
import { ValidationError } from "../utils/error.js";

// Generate a PREVIEW image for a trophy (or the hall background) from a prompt,
// store it to Supabase, and return its URL. This is not attached to the trophy
// yet — the user reviews it and, if they like it, approves it via the trophy
// upsert (which sets image_url). Each generation gets a unique path so previews
// never overwrite an already-approved image.
export async function generateTrophyImage(user_id, key, prompt, wide) {
  if (!user_id) throw new ValidationError("Missing user_id");
  if (!isTrophyKey(key)) throw new ValidationError("Unknown trophy_key");
  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0)
    throw new ValidationError("Missing prompt");

  const imageUrl = await falGenerate(prompt, wide ? "landscape_16_9" : "square_hd");
  const buffer = Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
  const path = `trophies/${user_id}/${key}-${Date.now()}.jpg`;
  const publicUrl = await uploadToStorage(path, buffer, "image/jpeg");
  return { image_url: publicUrl };
}
