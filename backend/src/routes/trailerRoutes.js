import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getTrailers,
  getTrailer,
  createTrailer,
  patchTrailer,
  deleteTrailer,
} from "../services/trailerServices.js";

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

router.get("/me", async (req, res) => {
  try {
    const trailers = await getTrailers(req.user.user_id);
    return res.status(200).json({ trailers });
  } catch (err) {
    return handleError(res, err);
  }
});

router.get("/me/:id", async (req, res) => {
  try {
    const trailer = await getTrailer(req.user.user_id, req.params.id);
    return res.status(200).json({ trailer });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/me", async (req, res) => {
  try {
    const trailer = await createTrailer(req.user.user_id, req.body);
    return res.status(201).json({ trailer });
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch("/me/:id", async (req, res) => {
  try {
    const trailer = await patchTrailer(req.user.user_id, req.params.id, req.body);
    return res.status(200).json({ trailer });
  } catch (err) {
    return handleError(res, err);
  }
});

router.delete("/me/:id", async (req, res) => {
  try {
    const deleted = await deleteTrailer(req.user.user_id, req.params.id);
    return res.status(200).json({ deleted });
  } catch (err) {
    return handleError(res, err);
  }
});

export default router;
