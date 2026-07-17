import { Router } from "express";
import { createUser, validateUser } from "../services/userServices.js";
import { signToken } from "../utils/jwt.js";

const router = Router();

// ---- CREATE USER THEN RETURN TOKEN ----

router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await createUser(email, password);

    // A fresh signup is an account owner/admin (account = self).
    const accessToken = signToken({
      user_id: user.user_id,
      account_id: user.user_id,
      role: "admin",
    });

    res.status(201).json({
      message: "User created",
      user: { ...user, role: "admin", display_name: null },
      token: accessToken,
    });
  } catch (err) {
    if (err.message === "Missing fields") {
      return res.status(400).json({ error: err.message });
    }

    if (err.message === "Invalid email") {
      return res.status(400).json({ error: err.message });
    }

    if (err.message === "Email already exists") {
      return res.status(409).json({ error: err.message });
    }

    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await validateUser(email, password);

    // Data scope resolves to the account owner; a dispatcher rides their owner's id.
    const account_id = user.parent_user_id ?? user.user_id;
    const accessToken = signToken({
      user_id: user.user_id,
      account_id,
      role: user.role,
    });

    res.status(200).json({
      message: "User logged in successfully",
      user: {
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
      },
      token: accessToken,
    });
  } catch (err) {
    if (err.message === "Missing fields") {
      return res.status(400).json({ error: err.message });
    }

    if (err.message === "Invalid credentials") {
      return res.status(401).json({ error: err.message });
    }

    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

export default router;
