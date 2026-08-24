import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getAssumptions,
  patchAssumptions,
  getFinancials,
  upsertFinancials,
  getAdjustments,
  setAdjustment,
} from "../services/cashflowServices.js";

const router = express.Router();
router.use(requireAuth);

const handle = (fn) => async (req, res) => {
  try {
    const out = await fn(req);
    return res.status(out?.status ?? 200).json(out?.body ?? out ?? {});
  } catch (err) {
    if (err.type === "validation" || err.type === "not_found") {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
};

router.get("/assumptions", handle(async (req) => ({ assumptions: await getAssumptions(req.user.user_id) })));
router.patch("/assumptions", handle(async (req) => ({ assumptions: await patchAssumptions(req.user.user_id, req.body) })));

router.get("/financials", handle(async (req) => ({ financials: await getFinancials(req.user.user_id) })));
router.post("/financials", handle(async (req) => ({ status: 201, body: { financials: await upsertFinancials(req.user.user_id, req.body.rows) } })));

router.get("/adjustments", handle(async (req) => ({ adjustments: await getAdjustments(req.user.user_id) })));
router.put("/adjustments", handle(async (req) => ({ adjustment: await setAdjustment(req.user.user_id, req.body) })));

export default router;
