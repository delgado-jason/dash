import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getVerifiedCoords,
  ensureManyCityCoords,
} from "../services/cityCoordsService.js";

const router = express.Router();
router.use(requireAuth);

// ---- ALL VERIFIED CITY COORDINATES ----
// The lookup the Foreman distances against. Small reference table (one row per
// distinct booked city), returned whole; the client keys it by "CITY,ST".
router.get("/", async (req, res) => {
  try {
    const coords = await getVerifiedCoords();
    return res.status(200).json({ message: "City coordinates", coords });
  } catch (err) {
    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

// ---- WARM THE CACHE ----
// The client posts the cities on its current board; we geocode any missing ones
// in the BACKGROUND (never blocking the response) so the next render is precise,
// and return what's already verified now. A city center is write-once, so this is
// a no-op after the first pass. Body: { cities: [{ city, state }, …] }.
router.post("/ensure", async (req, res) => {
  try {
    const places = Array.isArray(req.body?.cities) ? req.body.cities : [];
    // Fire-and-forget: don't await the geocoding, and swallow its errors so a
    // HERE hiccup never surfaces as a request failure.
    ensureManyCityCoords(places).catch(() => {});
    const coords = await getVerifiedCoords();
    return res.status(202).json({ message: "Warming city coordinates", coords });
  } catch (err) {
    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

export default router;
