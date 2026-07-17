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
    SELECT user_id, email, password_hash, role, parent_user_id, display_name, avatar_url
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
  return {
    user_id: user.user_id,
    email: user.email,
    role: user.role,
    parent_user_id: user.parent_user_id,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
  };
}

// ---- CREATE A DISPATCHER under an owner's account ----
// role + parent are forced by the caller (the admin's account) — never trusted
// from the client — so a dispatcher can't be created outside its account.
export async function createDispatcher(accountId, { email, password, display_name }) {
  if (!accountId) throw new Error("Missing account");
  if (!email || !password) throw new Error("Missing fields");
  if (!email.includes("@")) throw new Error("Invalid email");

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const result = await db.query(
      `INSERT INTO users (email, password_hash, role, parent_user_id, display_name)
       VALUES ($1, $2, 'dispatcher', $3, $4)
       RETURNING user_id, email, role, display_name, created_at`,
      [email, passwordHash, accountId, display_name ?? null],
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === "23505") throw new Error("Email already exists");
    throw err;
  }
}

// ---- LIST an account's team ---- (owner + its dispatchers; safe fields only)
export async function listAccountUsers(accountId) {
  const result = await db.query(
    `SELECT user_id, email, role, display_name, avatar_url, created_at
       FROM users
      WHERE user_id = $1 OR parent_user_id = $1
      ORDER BY (user_id = $1) DESC, created_at`,
    [accountId],
  );
  return result.rows;
}

// ---- FETCH one account member ---- (for a team member's dispatcher page).
// Scoped to the account, so only the owner + its dispatchers are reachable.
// The route decides WHO may ask (self, or an admin viewing the team).
export async function getTeamMember(accountId, targetId) {
  const result = await db.query(
    `SELECT user_id, email, role, display_name, avatar_url, created_at
       FROM users
      WHERE user_id = $1 AND (user_id = $2 OR parent_user_id = $2)`,
    [targetId, accountId],
  );
  return result.rows[0] ?? null;
}
