import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  recordHit,
  recordError,
  hitsSummary,
  recentErrors,
} from "../services/appTelemetryServices.js";
import { clampDays } from "../utils/validation/appTelemetryValidation.js";

const router = express.Router();

// The reads are the owner's (and the watch token's, which reads as the owner).
const ownerOnly = (req, res, next) =>
  req.user?.role === "admin"
    ? next()
    : res.status(403).json({ error: "Admin only" });

const sendError = (res, err) =>
  err.type === "validation"
    ? res.status(err.statusCode).json({ error: err.message })
    : res
        .status(500)
        .json({ error: "Internal Server Error", message: err.message });

// ---- A PAGE OPENED ---- any signed-in person; 204, nothing to say back.
router.post("/hits", requireAuth, async (req, res) => {
  try {
    await recordHit(req.user, req.body);
    return res.status(204).end();
  } catch (err) {
    return sendError(res, err);
  }
});

// ---- AN ERROR CAUGHT ---- 204 whether kept or dropped by the flood guard.
router.post("/errors", requireAuth, async (req, res) => {
  try {
    await recordError(req.user, req.body);
    return res.status(204).end();
  } catch (err) {
    return sendError(res, err);
  }
});

// ---- WHAT GETS OPENED ---- ?days= (30 by default, 1–365).
router.get("/hits/summary", requireAuth, ownerOnly, async (req, res) => {
  try {
    const summary = await hitsSummary(req.user.account_id, clampDays(req.query.days));
    return res.status(200).json(summary);
  } catch (err) {
    return sendError(res, err);
  }
});

// ---- THE ERRORS CAUGHT ---- ?days= (30 by default, 1–365).
router.get("/errors", requireAuth, ownerOnly, async (req, res) => {
  try {
    const errors = await recentErrors(req.user.account_id, clampDays(req.query.days));
    return res.status(200).json(errors);
  } catch (err) {
    return sendError(res, err);
  }
});

export default router;
