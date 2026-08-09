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

// Locked house style — re-briefed to the Forge world (2026-08-09), matching
// lib/trophies/style.ts so avatars and trophy art read as one set: grounded
// premium render, machined steel + amber, no comic. Per-kind constraints below
// are battle-tested against real generation failures — change the style, not them.
const STYLE =
  "premium cinematic character render, grounded and realistic, dark " +
  "machined-steel industrial depot setting, brushed gunmetal and warm amber " +
  "palette, glowing amber rim lighting, dramatic workshop light, adult and " +
  "iconic — no comic style, no cel shading, no halftone, no cartoon, no " +
  "illustration outlines";

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
  // user — the dispatcher behind the desk (role-relevant, not a driver).
  if (kind === "user") {
    const g = variant === "female" ? "woman" : variant === "male" ? "man" : "person";
    return (
      `${STYLE}. Head and shoulders avatar portrait of a ${g} freight dispatcher ` +
      "at a command desk wearing a phone headset, glowing load-board and route " +
      "map monitors behind, confident friendly expression."
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

export const falGenerate = async (prompt, image_size = "square_hd") => {
  if (!FAL_API_KEY) throw new ValidationError("FAL_API_KEY is not configured");
  const res = await fetch(`https://fal.run/${FAL_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${FAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, image_size, num_images: 1 }),
  });
  if (!res.ok)
    throw new Error(`Image generation failed (${res.status})`);
  const data = await res.json();
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error("Image generation returned no image");
  return url;
};

export const uploadToStorage = async (path, buffer, contentType) => {
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

const isValidKind = (kind) => kind === "user" || !!ENTITY[kind];

const setAvatarUrl = async (kind, auth, id, url) => {
  if (kind === "user") {
    await db.query(`UPDATE users SET avatar_url = $1 WHERE user_id = $2`, [
      url,
      id,
    ]);
    return;
  }
  const { table, idCol } = ENTITY[kind];
  await db.query(
    `UPDATE ${table} SET avatar_url = $1, updated_at = NOW()
     WHERE ${idCol} = $2 AND user_id = $3`,
    [url, id, auth.account_id],
  );
};

// Resolve the target row AND authorize. Entities belong to the account (user_id
// = account). A `user` avatar is the person's own (id === self_id) or, for an
// admin, any member of their account.
const resolveTarget = async (kind, auth, id) => {
  if (kind === "user") {
    if (id !== auth.self_id && auth.role !== "admin")
      throw new NotFoundError("user not found");
    const r = await db.query(
      `SELECT * FROM users
        WHERE user_id = $1 AND (user_id = $2 OR parent_user_id = $2)`,
      [id, auth.account_id],
    );
    if (r.rowCount === 0) throw new NotFoundError("user not found");
    return r.rows[0];
  }
  const { table, idCol } = ENTITY[kind];
  const r = await db.query(
    `SELECT * FROM ${table} WHERE ${idCol} = $1 AND user_id = $2`,
    [id, auth.account_id],
  );
  if (r.rowCount === 0) throw new NotFoundError(`${kind} not found`);
  return r.rows[0];
};

// Generate a themed avatar, store it, and set the target's avatar_url.
// `auth` is req.user ({ account_id, self_id, role }).
export const generateAvatar = async (auth, kind, id, variant) => {
  if (!isValidKind(kind)) throw new ValidationError("Invalid avatar kind");
  const row = await resolveTarget(kind, auth, id);
  const imageUrl = await falGenerate(buildPrompt(kind, row, variant));
  const buffer = Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
  const path = `${kind}/${id}.jpg`;
  const publicUrl = await uploadToStorage(path, buffer, "image/jpeg");
  await setAvatarUrl(kind, auth, id, publicUrl);
  return { avatar_url: publicUrl };
};

// Store a user-uploaded image (buffer) and set the target's avatar_url.
export const uploadAvatar = async (auth, kind, id, buffer, contentType) => {
  if (!isValidKind(kind)) throw new ValidationError("Invalid avatar kind");
  await resolveTarget(kind, auth, id); // ownership / authorization check
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const path = `${kind}/${id}-upload.${ext}`;
  const publicUrl = await uploadToStorage(path, buffer, contentType);
  await setAvatarUrl(kind, auth, id, publicUrl);
  return { avatar_url: publicUrl };
};
