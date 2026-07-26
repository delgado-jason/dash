import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { loadMiles } from "../services/routingService.js";

const router = express.Router();
router.use(requireAuth);

// ---- SCORE-A-LOAD MILEAGE ----
// Body: { truckNow?, pickup, delivery, dims? } where a place is { city, state }
// and dims is { widthIn, heightIn, lengthIn, grossWeightLb }. Returns loaded +
// deadhead miles, either of which may be null (no route, unconfigured key, or a
// bad geocode) — the Scorer treats null as "type it yourself".
router.post("/load-miles", async (req, res) => {
  try {
    const { truckNow, pickup, delivery, dims } = req.body ?? {};
    const miles = await loadMiles({ truckNow, pickup, delivery, dims });
    return res.status(200).json({
      message: "Load miles computed",
      ...miles,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

export default router;
