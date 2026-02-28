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
    throw new Error("No profile found");
  }
  const profile = result.rows[0];
  return profile;
}
