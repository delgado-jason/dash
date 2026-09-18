import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getSiteTraffic } from "../services/siteTrafficServices.js";

const router = express.Router();
router.use(requireAuth);

// ---- GET THE WEBSITE'S TRAFFIC ----
// Authenticated and account-scoped like everything else in dash. The PUBLIC
// half of this feature — the beacon writing rows — is POST /site-hits, which
// calls record_site_hit (migration 081) with no identity at all.
router.get("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const traffic = await getSiteTraffic(user_id, req.query.window);

    return res.status(200).json({
      message: "Site traffic retrieved successfully",
      ...traffic,
    });
  } catch (err) {
    if (err.type === "validation") {
      return res.status(err.statusCode).json({ error: err.message });
    }

    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

export default router;
