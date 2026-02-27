import { Router } from "express";
import { createUser, validateUser } from "../services/userServices.js";
import { signToken } from "../utils/jwt.js";

const router = Router();

// ---- CREATE USER THEN RETURN TOKEN ----

router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await createUser(email, password);

    // Create JWT
    const accessToken = signToken({ user_id: user.user_id });

    res.status(201).json({ message: "User created", user, token: accessToken });
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

    // Create JWT
    const accessToken = signToken({ user_id: user.user_id });

    res.status(200).json({
      message: "User logged in successfully",
      user,
      token: accessToken,
    });
  } catch (err) {
    if (err.message === "Missing fields") {
      return res.status(400).json({ error: err.message });
    }

    if (err.message === "Invalid credentials") {
      return res.status(401).json({ error: err.message });
    }

    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
