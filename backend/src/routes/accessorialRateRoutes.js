import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getAccessorialRates,
  upsertAccessorialRate,
  deleteAccessorialRate,
} from "../services/accessorialRateServices.js";

const router = express.Router();
router.use(requireAuth);

const handleError = (res, err) => {
  if (err.type === "validation")
    return res.status(err.statusCode).json({ error: err.message });
  if (err.type === "not_found")
    return res.status(err.statusCode).json({ error: err.message });
  return res
    .status(500)
    .json({ error: "Internal Server Error", message: err.message });
};

router.get("/", async (req, res) => {
  try {
    const rates = await getAccessorialRates(req.user.user_id);
    return res.status(200).json({ rates });
  } catch (err) {
    return handleError(res, err);
  }
});

router.put("/", async (req, res) => {
  try {
    const rate = await upsertAccessorialRate(req.user.user_id, req.body);
    return res.status(200).json({ rate });
  } catch (err) {
    return handleError(res, err);
  }
});

router.delete("/:type", async (req, res) => {
  try {
    const deleted = await deleteAccessorialRate(
      req.user.user_id,
      decodeURIComponent(req.params.type),
    );
    return res.status(200).json({ deleted });
  } catch (err) {
    return handleError(res, err);
  }
});

export default router;
