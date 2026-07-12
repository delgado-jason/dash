import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getSettlementSchedule,
  upsertSettlementSchedule,
} from "../services/settlementScheduleServices.js";

const router = express.Router();
router.use(requireAuth);

const handleError = (res, err) => {
  if (err.type === "validation")
    return res.status(err.statusCode).json({ error: err.message });
  return res
    .status(500)
    .json({ error: "Internal Server Error", message: err.message });
};

router.get("/", async (req, res) => {
  try {
    const schedule = await getSettlementSchedule(req.user.user_id);
    return res.status(200).json({ schedule });
  } catch (err) {
    return handleError(res, err);
  }
});

router.put("/", async (req, res) => {
  try {
    const schedule = await upsertSettlementSchedule(req.user.user_id, req.body);
    return res.status(200).json({ schedule });
  } catch (err) {
    return handleError(res, err);
  }
});

export default router;
