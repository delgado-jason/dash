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
