import express from "express";
import { db } from "../../db/pool.js";
import bcrypt from "bcrypt";

const router = express.Router();

router.get("/", async (req, res, next) => {
  const result = await db.query(`SELECT * FROM users`);

  const data = result.rows;
  res.send(data.map((user) => user.email));
});

router.post("/", async (req, res) => {
  const { email, password } = req.body;

  // validate
  if (!email || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  // hash password
  const passwordHash = await bcrypt.hash(password, 10);
  // insert into database
  try {
    db.query(
      `
    INSERT INTO users(email, password_hash)
    VALUES ($1, $2)
    `,
      [email, passwordHash],
    );

    // return created user
    res.status(201).json({
      message: "User created",
      user: {
        email: email,
        password: passwordHash,
      },
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to create user",
      error: err,
    });
  }
});

export default router;
