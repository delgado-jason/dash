import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { createProfile, getProfile } from "../services/profileServices.js";

const router = express.Router();

// ---- GET USER PROFILE ----
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const user_profile = await getProfile(user_id);
    return res.status(200).json({
      message: "Retrieved profile",
      profile: user_profile,
    });
  } catch (err) {
    if (err.message === "No profile found") {
      return res.status(404).json({ error: err.message });
    }

    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---- CREATE USER PROFILE ----
router.post("/me", requireAuth, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const profile = await createProfile(user_id, req.body);
    return res.status(201).json({
      message: "Profile created",
      profile,
    });
  } catch (err) {
    if (err.message === "Profile not created") {
      return res.status(400).json({ error: err.message });
    }

    if (err.code === "23505") {
      res.status(409).json({ error: "Profile already exists" });
    }

    return res.status(500).json({
      error: "Internal Server Error",
      detail: err.message, // <-- temporarily expose
      code: err.code, // <-- helpful for Postgres errors
    });
  }
});

export default router;
