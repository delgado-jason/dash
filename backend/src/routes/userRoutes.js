import express from "express";
import { db } from "../../db/pool.js";
import bcrypt from "bcrypt";
import { createUser } from "../services/userServices.js";

const router = express.Router();

// GET all users (emails only)
router.get("/", async (req, res) => {
  try {
    const result = await db.query("SELECT email FROM users");
    res.json(result.rows.map((u) => u.email));
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch users", error: err.message });
  }
});

// CREATE user
router.post("/", async (req, res) => {
  const { email, password } = req.body;
  createUser(email, password);
});

// UPDATE email and/or password
router.patch("/:id", async (req, res) => {
  console.log("PATCH route hit", req.params);

  const { id } = req.params;
  const { email, password } = req.body;

  // ✅ Only error if neither is provided
  if (!email && !password) {
    return res.status(400).json({ message: "Nothing to update" });
  }

  try {
    // Update email if provided
    if (email) {
      if (!email.includes("@")) {
        return res.status(400).json({ message: "Must be a valid email" });
      }

      const result = await db.query(
        `
        UPDATE users
        SET email = $1
        WHERE user_id = $2
        RETURNING user_id, email, created_at
        `,
        [email, id],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      // If only updating email, return here.
      if (!password) {
        return res
          .status(200)
          .json({ message: "Updated email", user: result.rows[0] });
      }
      // If also updating password, continue.
    }

    // Update password if provided
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);

      const result = await db.query(
        `
        UPDATE users
        SET password_hash = $1
        WHERE user_id = $2
        RETURNING user_id, email, created_at
        `,
        [passwordHash, id],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      return res
        .status(200)
        .json({ message: "Updated password", user: result.rows[0] });
    }
  } catch (err) {
    if (err.code === "22P02") {
      // invalid UUID
      return res.status(400).json({ message: "Invalid user id (UUID)" });
    }
    if (err.code === "23505") {
      return res.status(409).json({ message: "Email already exists" });
    }

    return res.status(500).json({
      message: "Update failed",
      error: err.message,
    });
  }
});

router.delete("/:id", async (req, res) => {
  const id = req.params.id;

  // ---- DELETE USER ----
  try {
    await db.query(
      `
      DELETE
      FROM users
      WHERE user_id = $1
      RETURNING user_id, email
      `,
      [id],
    );
    res.status(200).json({ message: "Deleted user successfully" });
  } catch (err) {
    res.status(500).json({
      message: "Failed to delete user",
      errMessage: err,
    });
  }
});

export default router;
