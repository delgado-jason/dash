import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireServiceToken } from "../middleware/requireServiceToken.js";
import {
  ingestSettlement,
  getSettlements,
  getLoadSettlement,
} from "../services/settlementServices.js";

const router = express.Router();

// The DTS server feeds a parsed, self-reconciled weekly statement.
// Registered before the blanket requireAuth; carries its own gate.
router.post("/ingest", requireServiceToken, async (req, res) => {
  try {
    const r = await ingestSettlement(req.user.user_id, req.body);
    return res.status(r.inserted ? 201 : 200).json({
      message: r.inserted
        ? "Settlement archived"
        : "Week already archived — existing data is authoritative; skipped",
      ...r,
    });
  } catch (err) {
    if (err.type === "validation") return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
});

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const settlements = await getSettlements(req.user.user_id, req.query.limit);
    return res.status(200).json({
      message: "Settlements retrieved successfully",
      count: settlements.length,
      settlements,
    });
  } catch (err) {
    if (err.type === "validation") return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
});

router.get("/load/:load_id", async (req, res) => {
  try {
    const lines = await getLoadSettlement(req.user.user_id, req.params.load_id);
    return res.status(200).json({
      message: "Settlement lines retrieved successfully",
      count: lines.length,
      lines,
    });
  } catch (err) {
    if (err.type === "validation") return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
});

export default router;
