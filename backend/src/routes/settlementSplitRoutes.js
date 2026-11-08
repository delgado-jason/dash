import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  listSettlementSplits,
  createSettlementSplit,
  updateSettlementSplit,
  deleteSettlementSplit,
} from "../services/settlementSplitServices.js";

const router = express.Router();
router.use(requireAuth);

const handleError = (res, err) => {
  if (err.type === "validation" || err.type === "not_found" || err.type === "conflict")
    return res.status(err.statusCode).json({ error: err.message, details: err.details });
  return res.status(500).json({ error: "Internal Server Error", message: err.message });
};

router.get("/", async (req, res) => {
  try {
    const splits = await listSettlementSplits(req.user.user_id);
    return res.status(200).json({ splits });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/", async (req, res) => {
  try {
    const split = await createSettlementSplit(req.user.user_id, req.body);
    return res.status(201).json({ split });
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch("/:split_id", async (req, res) => {
  try {
    const split = await updateSettlementSplit(req.user.user_id, req.params.split_id, req.body);
    return res.status(200).json({ split });
  } catch (err) {
    return handleError(res, err);
  }
});

router.delete("/:split_id", async (req, res) => {
  try {
    await deleteSettlementSplit(req.user.user_id, req.params.split_id);
    return res.status(204).end();
  } catch (err) {
    return handleError(res, err);
  }
});

export default router;
