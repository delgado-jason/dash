import { db } from "../../db/pool.js";
import { ValidationError, NotFoundError } from "../utils/error.js";

const FAL_API_KEY = process.env.FAL_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "avatars";
const FAL_MODEL = "fal-ai/flux/schnell";

// Which table + id column each avatar kind writes to. Fixed map (not user
// input), so interpolating the names into SQL is safe.
const ENTITY = {
  truck: { table: "trucks", idCol: "truck_id" },
  driver: { table: "drivers", idCol: "driver_id" },
  trailer: { table: "trailers", idCol: "trailer_id" },
};

// Locked house style: comic-illustration, steel-blue + amber, dark depot,
// clean front 3/4 (the truck-0 / driver-0 look Jason signed off on).
const STYLE =
  "comic book digital illustration, cel shaded, bold clean line art, " +
  "dark steel-blue and amber color palette, dark industrial background, " +
  "cinematic rim lighting";

const buildPrompt = (kind, row, variant) => {
  if (kind === "truck") {
    const desc = [row.year, row.make, row.model].filter(Boolean).join(" ");
    return (
      `${STYLE}. A ${desc || "modern"} semi truck day cab tractor, ` +
      "clean front three-quarter view, chrome grille angled at 45 degrees, " +
      "glowing amber marker lights, dynamic vehicle character portrait."
    );
  }
  if (kind === "driver") {
    const g = variant === "female" ? "female" : "male";
    return (
      `${STYLE}. Head and shoulders avatar portrait of a rugged ${g} American ` +
      "truck driver, baseball cap, work shirt, confident calm expression."
    );
  }
  // trailer — reflect the actual type, and force a STANDALONE trailer (flux
  // otherwise draws a flatbed body truck).
  const len = row.length_ft ? `${row.length_ft} foot ` : "";
  const type = row.trailer_type || "flatbed";
  return (
    `${STYLE}. A single detached ${len}${type} semi-trailer parked alone on its ` +
    "landing gear, NO truck, NO cab, NO tractor attached, empty deck, side " +
    "three-quarter view, isolated product shot."
  );
};

const falGenerate = async (prompt) => {
  if (!FAL_API_KEY) throw new ValidationError("FAL_API_KEY is not configured");
  const res = await fetch(`https://fal.run/${FAL_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${FAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, image_size: "square_hd", num_images: 1 }),
  });
  if (!res.ok)
    throw new Error(`Image generation failed (${res.status})`);
  const data = await res.json();
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error("Image generation returned no image");
  return url;
};

const uploadToStorage = async (path, buffer, contentType) => {
  if (!SUPABASE_URL || !SERVICE_KEY)
    throw new ValidationError(
      "Avatar storage is not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)",
    );
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: buffer,
    },
  );
  if (!res.ok)
    throw new Error(`Storage upload failed (${res.status})`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
};

const setAvatarUrl = async (kind, user_id, id, url) => {
  const { table, idCol } = ENTITY[kind];
  await db.query(
    `UPDATE ${table} SET avatar_url = $1, updated_at = NOW()
     WHERE ${idCol} = $2 AND user_id = $3`,
    [url, id, user_id],
  );
};

const getEntity = async (kind, user_id, id) => {
  const { table, idCol } = ENTITY[kind];
  const r = await db.query(
    `SELECT * FROM ${table} WHERE ${idCol} = $1 AND user_id = $2`,
    [id, user_id],
  );
  if (r.rowCount === 0) throw new NotFoundError(`${kind} not found`);
  return r.rows[0];
};

// Generate a themed avatar, store it, and set the entity's avatar_url.
export const generateAvatar = async (user_id, kind, id, variant) => {
  if (!ENTITY[kind]) throw new ValidationError("Invalid avatar kind");
  const row = await getEntity(kind, user_id, id);
  const imageUrl = await falGenerate(buildPrompt(kind, row, variant));
  const buffer = Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
  const path = `${kind}/${id}.jpg`;
  const publicUrl = await uploadToStorage(path, buffer, "image/jpeg");
  await setAvatarUrl(kind, user_id, id, publicUrl);
  return { avatar_url: publicUrl };
};

// Store a user-uploaded image (buffer) and set the entity's avatar_url.
export const uploadAvatar = async (user_id, kind, id, buffer, contentType) => {
  if (!ENTITY[kind]) throw new ValidationError("Invalid avatar kind");
  await getEntity(kind, user_id, id); // ownership check
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const path = `${kind}/${id}-upload.${ext}`;
  const publicUrl = await uploadToStorage(path, buffer, contentType);
  await setAvatarUrl(kind, user_id, id, publicUrl);
  return { avatar_url: publicUrl };
};
