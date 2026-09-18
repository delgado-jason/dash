import express from "express";
import { recordSiteHit } from "../services/siteHitServices.js";

const router = express.Router();

// ---- RECORD A PAGE VIEW (public — the website's beacon) ----
// No auth on purpose: the caller is delgadotruckingservices.com's /api/hit
// function, which has no dash identity, and the Data API (PostgREST) is
// switched off on both Supabase projects, so this is the site's only door.
// The body carries no secret and the answer carries no information: 204
// whether the view was kept or silently dropped by record_site_hit (unknown
// host, rate limit). Only a malformed body earns a 400.
router.post("/", async (req, res) => {
  try {
    await recordSiteHit(req.body);
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

export default router;
