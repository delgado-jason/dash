import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getRelationshipReviews,
  upsertRelationshipReview,
} from "../services/relationshipReviewServices.js";

// /relationship-reviews — the month sign-off and the quarter audit. GET is for
// everyone on the account; POST is the owner's (403 otherwise, from the
// service — the same shape as the tier gate).
const router = express.Router();
router.use(requireAuth);

const handle = (fn) => async (req, res) => {
  try {
    const out = await fn(req);
    return res.status(out?.status ?? 200).json(out?.body ?? out ?? {});
  } catch (err) {
    if (err.type === "validation" || err.type === "not_found" || err.type === "forbidden_error") {
      return res.status(err.statusCode).json({ error: err.message, details: err.details });
    }
    return res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
};

router.get("/", handle(async (req) => ({ reviews: await getRelationshipReviews(req.user.user_id) })));
// Upsert on (account, period_key, kind) — signing again replaces the targets.
router.post(
  "/",
  handle(async (req) => ({
    status: 201,
    body: { review: await upsertRelationshipReview(req.user.user_id, req.body, req.user) },
  })),
);

export default router;
