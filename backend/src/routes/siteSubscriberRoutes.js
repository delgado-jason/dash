import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getSiteSubscribers,
  recordSiteSubscriber,
  syncPendingToKit,
} from "../services/siteSubscriberServices.js";

// Two of these three routes are Jason's and one belongs to the website, so
// requireAuth is applied PER ROUTE here rather than with a router.use — the
// public one has to be visibly public, in the file, next to the reason.
const router = express.Router();

// ---- RECORD A SIGNUP (public — the Logbook's form) ----
// No auth on purpose: the caller is delgadotruckingservices.com's
// /api/subscribe function, which has no dash identity, and the Data API
// (PostgREST) is switched off on both Supabase projects, so this is the site's
// only door. The body carries no secret and the answer carries no information:
// 204 whether the address was kept or silently dropped (unknown host, rate
// limit, Kit unreachable). Only a malformed body earns a 400.
router.post("/", async (req, res) => {
  try {
    await recordSiteSubscriber(req.body);
    return res.status(204).end();
  } catch (err) {
    if (err.type === "validation") {
      return res.status(err.statusCode).json({ error: err.message });
    }

    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

// ---- THE LIST, FOR THE WEBSITE PAGE ----
// Authenticated and account-scoped like everything else in dash.
router.get("/", requireAuth, async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const subscribers = await getSiteSubscribers(user_id, req.query.window);

    return res.status(200).json({
      message: "Site subscribers retrieved successfully",
      ...subscribers,
    });
  } catch (err) {
    if (err.type === "validation") {
      return res.status(err.statusCode).json({ error: err.message });
    }

    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

// ---- PUSH THE WAITING ROWS TO KIT ----
// The door for the day KIT_API_KEY and KIT_FORM_ID land on Railway: every
// signup taken before then is sitting as 'pending', and this moves them,
// oldest first. A POST he presses rather than something GET / does behind his
// back — handing fifty addresses to a third party is an act, not a page load.
// It moves PENDING rows only; a 'failed' row is a flag to read, and putting it
// back in the queue is a decision that needs its own answer (Kit rejected that
// address for a reason) rather than an automatic retry loop.
// It also asks Kit how the rows it already holds are doing, so a reader who
// clicked the confirmation link shows as confirmed and one who left shows as
// unsubscribed — the only way dash ever learns either.
router.post("/sync", requireAuth, async (req, res) => {
  try {
    const result = await syncPendingToKit(req.user.user_id);

    return res.status(200).json({
      message: "Kit sync complete",
      ...result,
    });
  } catch (err) {
    if (err.type === "validation") {
      return res.status(err.statusCode).json({ error: err.message });
    }

    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

export default router;
