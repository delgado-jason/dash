import { db } from "../../db/pool.js";

export async function getProfile(id) {
  const result = await db.query(
    `
        SELECT first_name, last_name, phone_num,
        company_name, carrier_type, owns_trailer,
        home_address, home_city, home_state
        FROM profiles
        WHERE user_id = $1;
        `,
    [id],
  );

  if (result.rowCount === 0) {
    throw new Error("Profile not created");
  }
  const profile = result.rows[0];
  return profile;
}

export async function createProfile(id, data) {
  const {
    first_name,
    last_name,
    phone_num,
    company_name,
    carrier_type,
    owns_trailer,
    home_address,
    home_city,
    home_state,
  } = data;

  const result = await db.query(
    `
    INSERT INTO profiles (user_id, first_name, last_name, phone_num, company_name, carrier_type, owns_trailer, home_address, home_city, home_state)
      VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING first_name, last_name, phone_num, company_name, carrier_type, owns_trailer, home_address, home_city, home_state, created_at
    `,
    [
      id,
      first_name,
      last_name,
      phone_num,
      company_name,
      carrier_type,
      owns_trailer,
      home_address,
      home_city,
      home_state,
    ],
  );

  if (result.rowCount === 0) {
    throw new Error("Profile not created");
  }
  return result.rows[0];
}

/**
 * PATCH-style update:
 * - Updates only fields provided in `data`
 * - Whitelists allowed fields
 * - Returns updated profile row (safe columns)
 * - Throws Errors for invalid input / not found
 */
export async function updateProfile(user_id, data) {
  if (!user_id) {
    throw new Error("Missing user_id");
  }

  const allowedFields = [
    "first_name",
    "last_name",
    "phone_num",
    "company_name",
    "carrier_type",
    "owns_trailer",
    "home_address",
    "home_city",
    "home_state",
  ];

  // Build a clean updates object (don't drop false/0/empty string)
  const updates = {};
  for (const key of allowedFields) {
    if (
      Object.prototype.hasOwnProperty.call(data, key) &&
      data[key] !== undefined
    ) {
      updates[key] = data[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new Error("No valid fields to update");
  }

  // Optional lightweight validation examples
  if (updates.email) {
    // profiles doesn't include email, but leaving this pattern as reminder
    throw new Error("Invalid field");
  }
  if (updates.home_state && String(updates.home_state).length !== 2) {
    throw new Error("Invalid state");
  }
  if (updates.phone_num && String(updates.phone_num).length > 10) {
    throw new Error("Invalid phone");
  }

  const fields = Object.keys(updates);
  const values = Object.values(updates);

  // Build: "first_name = $1, home_city = $2, ..."
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");

  // user_id placeholder is the last one
  const userIdPlaceholder = `$${fields.length + 1}`;

  const result = await db.query(
    `
    UPDATE profiles
    SET ${setClause},
        updated_at = NOW()
    WHERE user_id = ${userIdPlaceholder}
    RETURNING
      user_id,
      first_name,
      last_name,
      phone_num,
      company_name,
      carrier_type,
      owns_trailer,
      home_address,
      home_city,
      home_state,
      created_at,
      updated_at
    `,
    [...values, user_id],
  );

  if (result.rowCount === 0) {
    throw new Error("Profile not found");
  }

  return result.rows[0];
}
