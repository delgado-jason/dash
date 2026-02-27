import { db } from "../../db/pool.js";
import bcrypt from "bcrypt";

/** These functions
 * Talk to the database
 * Return data
 * Throw errors
 */

export async function createUser(email, password) {
  if (!email || !password) {
    throw new Error("Missing fields");
  }

  if (!email.includes("@")) {
    throw new Error("Invalid email");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const result = await db.query(
      `
          INSERT INTO users (email, password_hash)
          VALUES ($1, $2)
          RETURNING user_id, email, created_at
        `,
      [email, passwordHash],
    );

    return result.rows[0];
  } catch (err) {
    // if email is UNIQUE, this is a common error
    if (err.code === "23505") {
      throw new Error("Email already exists");
    }

    throw err;
  }
}

// ---- VALIDATE USER ----
export async function validateUser(email, password) {
  if (!email || !password) {
    throw new Error("Missing fields");
  }

  // fetch user row
  const result = await db.query(
    `
    SELECT user_id, email, password_hash
    FROM users
    WHERE email = $1
    `,
    [email],
  );

  if (result.rowCount === 0) {
    throw new Error("Invalid credentials");
  }

  const user = result.rows[0];

  // validate password (promise form)
  const isValid = await bcrypt.compare(password, user.password_hash);

  if (!isValid) {
    throw new Error("Invalid credentials");
  }

  // return a SAFE user object (no password_hash)
  return { user_id: user.user_id, email: user.email };
}
