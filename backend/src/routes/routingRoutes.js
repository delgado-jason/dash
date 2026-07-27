import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { loadMiles, routeGeo } from "../services/routingService.js";
import { citySuggest } from "../services/hereProvider.js";
import { getLoad } from "../services/loadServices.js";
import { precedingLocation } from "../services/tripServices.js";

const router = express.Router();
router.use(requireAuth);

// ---- CITY AUTOCOMPLETE ----
// Typeahead suggestions for a city field. Non-fatal: any failure returns an
// empty list, so the dropdown just goes quiet and the user types normally.
router.get("/city-suggest", async (req, res) => {
  try {
    const suggestions = await citySuggest(req.query.q);
    return res.status(200).json({ suggestions });
  } catch {
    return res.status(200).json({ suggestions: [] });
  }
});

// ---- SCORE-A-LOAD MILEAGE ----
// Body: { truckNow?, pickup, delivery, dims? } where a place is { city, state }
// and dims is { widthIn, heightIn, lengthIn, grossWeightLb }. Returns loaded +
// deadhead miles, either of which may be null (no route, unconfigured key, or a
// bad geocode) — the Scorer treats null as "type it yourself".
router.post("/load-miles", async (req, res) => {
  try {
    const { truckNow, pickup, delivery, dims } = req.body ?? {};
    const miles = await loadMiles({ truckNow, pickup, delivery, dims });
    return res.status(200).json({
      message: "Load miles computed",
      ...miles,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

// ---- MISSION MAP DATA FOR A SAVED LOAD ----
// Geocoded pickup/delivery (+ the load's loaded miles) for the mission map. The
// deadhead leg is included ONLY once the load is active (in_transit/delivered) —
// on a booked load the deadhead origin isn't real yet, so it's omitted. Returns
// null coords when a city won't geocode; the page falls back to the text route.
router.get("/load-route/:loadId", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const load = await getLoad(user_id, req.params.loadId);
    const active =
      load.load_status === "in_transit" || load.load_status === "delivered";
    const deadheadOrigin = active
      ? await precedingLocation(user_id, load)
      : null;
    const geo = await routeGeo({
      deadheadOrigin,
      pickup: { city: load.origin_city, state: load.origin_state },
      delivery: { city: load.destination_city, state: load.destination_state },
    });
    return res.status(200).json({
      message: "Load route",
      ...geo,
      loadedMiles: Number(load.loaded_miles) || null,
    });
  } catch (err) {
    if (err.type === "not_found") {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

// ---- MISSION MAP DATA FOR A SCORED (not-yet-saved) LOAD ----
// Body: { truckNow?, pickup, delivery }. Deadhead leg drawn from truckNow.
router.post("/route", async (req, res) => {
  try {
    const { truckNow, pickup, delivery } = req.body ?? {};
    const geo = await routeGeo({ deadheadOrigin: truckNow, pickup, delivery });
    return res.status(200).json({ message: "Route", ...geo });
  } catch (err) {
    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

export default router;
