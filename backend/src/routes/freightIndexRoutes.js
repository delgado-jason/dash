import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getFreightIndexMonthly } from "../services/fredIndexService.js";

const router = express.Router();
router.use(requireAuth);

// ---- MACRO FREIGHT-RATE INDEX (FRED PPI proxy, cached) ----
// A blip at FRED should never break the Market page — degrade to an empty series
// so the barometer just shows the owner's own rate line.
router.get("/", async (req, res) => {
  try {
    const series = await getFreightIndexMonthly();
    return res.status(200).json({ series });
  } catch (err) {
    return res.status(200).json({ series: [], message: err.message });
  }
});

export default router;
