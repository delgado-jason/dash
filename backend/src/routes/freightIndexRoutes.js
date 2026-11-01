import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getFreightSignals } from "../services/fredIndexService.js";

const router = express.Router();
router.use(requireAuth);

// ---- MACRO FREIGHT-RATE INDEX (FRED PPI proxy, cached) + DIESEL ----
// A blip at FRED should never break the Market page — degrade to an empty series
// so the barometer just shows the owner's own rate line. `diesel` rides along
// (monthly averages) so the signal can tell a fuel move from a rate move.
router.get("/", async (req, res) => {
  try {
    const { index, diesel } = await getFreightSignals();
    return res.status(200).json({ series: index, diesel });
  } catch (err) {
    return res.status(200).json({ series: [], diesel: [], message: err.message });
  }
});

export default router;
