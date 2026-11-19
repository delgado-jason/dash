import { db } from "../../db/pool.js";
import bcrypt from "bcrypt";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from "../utils/error.js";
import { assertPassword } from "../utils/validation/passwordValidation.js";

/** These functions
 * Talk to the database
 * Return data
 * Throw errors
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createUser(email, password) {
  if (!email || !password) {
    throw new Error("Missing fields");
  }

  if (!email.includes("@")) {
    throw new Error("Invalid email");
  }

  assertPassword(password);

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

// ---- HOW MANY LOGINS EXIST ---- the signup gate's question: zero means a
// fresh dash that still needs its owner; anything else means the door is shut.
export async function countUsers() {
  const result = await db.query(`SELECT count(*)::int AS n FROM users`);
  return result.rows[0]?.n ?? 0;
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
  assertPassword(password);

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
    `SELECT u.user_id, u.email, u.role,
            COALESCE(
              u.display_name,
              NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '')
            ) AS display_name,
            u.avatar_url, u.created_at
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.user_id
      WHERE u.user_id = $1 OR u.parent_user_id = $1
      ORDER BY (u.user_id = $1) DESC, u.created_at`,
    [accountId],
  );
  return result.rows;
}

// ---- UPDATE my own display name ---- any member may set their own name (the
// owner has no profile row, so their name lives here alongside dispatchers').
export async function updateMyDisplayName(userId, displayName) {
  const result = await db.query(
    `UPDATE users SET display_name = $1 WHERE user_id = $2
       RETURNING user_id, email, role, display_name`,
    [displayName, userId],
  );
  return result.rows[0] ?? null;
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

// ---- WHOSE PASSWORD the owner may set ---- a dispatcher of THIS account. The
// owner's own row is refused with a pointer (their change needs the current
// password, below); any other row — another account's, or none — is "not
// found", one sentence for both, so the answer never confirms that an id
// exists somewhere else. Pure, so it is tested without a database.
export function resettableByOwner(target, accountId) {
  if (target && target.user_id === accountId) {
    throw new ForbiddenError(
      "Your own password is changed under Settings → Your password, with the current one.",
    );
  }
  if (!target || target.parent_user_id !== accountId) {
    throw new NotFoundError("No dispatcher with that id on your account.");
  }
  if (target.role !== "dispatcher") {
    throw new ForbiddenError("Only a dispatcher's password is set here.");
  }
  return target;
}

// ---- SET a dispatcher's password ---- the owner's reset for a forgotten one.
// No current password is asked: the owner is the one typing, as with the first
// password, and hands the new one over.
export async function setPasswordForTeamMember(accountId, targetId, newPassword) {
  assertPassword(newPassword);
  if (typeof targetId !== "string" || !UUID.test(targetId)) {
    throw new NotFoundError("No dispatcher with that id on your account.");
  }

  const found = await db.query(
    `SELECT user_id, email, role, parent_user_id, display_name
       FROM users
      WHERE user_id = $1`,
    [targetId],
  );
  const target = resettableByOwner(found.rows[0] ?? null, accountId);

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.query(`UPDATE users SET password_hash = $1 WHERE user_id = $2`, [
    passwordHash,
    target.user_id,
  ]);

  return {
    user_id: target.user_id,
    email: target.email,
    role: target.role,
    display_name: target.display_name,
  };
}

// ---- THE SHAPE CHECK for changing your own password ---- everything that can
// be refused before the database is asked, each as the sentence the form shows.
export function assertOwnPasswordChange(currentPassword, newPassword) {
  if (typeof currentPassword !== "string" || currentPassword.length === 0) {
    throw new ValidationError("Type your current password.");
  }
  assertPassword(newPassword);
  if (currentPassword === newPassword) {
    throw new ValidationError("The new password is the same as the current one.");
  }
}

// ---- CHANGE my own password ---- any member, owner or dispatcher, with the
// current one. A wrong current password is a 400 (a validation of the body),
// deliberately not a 401: the browser treats a 401 off any non-login route as
// a dead session and would sign the person out for a typo.
export async function changeOwnPassword(selfId, currentPassword, newPassword) {
  assertOwnPasswordChange(currentPassword, newPassword);

  const found = await db.query(
    `SELECT user_id, email, role, display_name, password_hash
       FROM users
      WHERE user_id = $1`,
    [selfId],
  );
  const me = found.rows[0];
  if (!me) throw new NotFoundError("No such user.");

  const ok = await bcrypt.compare(currentPassword, me.password_hash);
  if (!ok) throw new ValidationError("The current password is wrong.");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.query(`UPDATE users SET password_hash = $1 WHERE user_id = $2`, [
    passwordHash,
    selfId,
  ]);

  return {
    user_id: me.user_id,
    email: me.email,
    role: me.role,
    display_name: me.display_name,
  };
}
