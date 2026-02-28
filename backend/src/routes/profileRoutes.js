import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getProfile } from "../services/profileServices.js";

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

export default router;
