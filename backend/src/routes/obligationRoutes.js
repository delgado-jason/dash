import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getObligations,
  createObligation,
  patchObligation,
  deleteObligation,
} from "../services/obligationServices.js";

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
    const obligations = await getObligations(req.user.user_id);
    return res.status(200).json({ obligations });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/", async (req, res) => {
  try {
    const obligation = await createObligation(req.user.user_id, req.body);
    return res.status(201).json({ obligation });
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const obligation = await patchObligation(
      req.user.user_id,
      req.params.id,
      req.body,
    );
    return res.status(200).json({ obligation });
  } catch (err) {
    return handleError(res, err);
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await deleteObligation(req.user.user_id, req.params.id);
    return res.status(200).json({ deleted });
  } catch (err) {
    return handleError(res, err);
  }
});

export default router;
