import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { loadMiles, renderRouteMap } from "../services/routingService.js";
import { getLoad } from "../services/loadServices.js";
import { precedingLocation } from "../services/tripServices.js";

const router = express.Router();
router.use(requireAuth);

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

// ---- MISSION MAP FOR A SAVED LOAD ----
// Renders the load's haul, with the deadhead leg chained from wherever the truck
// sat before it. Returns { image: dataURI | null }; null just means "show the
// text route" — a missing map never errors the page.
router.get("/load-map/:loadId", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const load = await getLoad(user_id, req.params.loadId);
    const deadheadOrigin = await precedingLocation(user_id, load);
    const image = await renderRouteMap({
      deadheadOrigin,
      pickup: { city: load.origin_city, state: load.origin_state },
      delivery: { city: load.destination_city, state: load.destination_state },
    });
    return res.status(200).json({ message: "Load map", image });
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

// ---- MISSION MAP FOR A SCORED (not-yet-saved) LOAD ----
// Body: { truckNow?, pickup, delivery }. Deadhead leg drawn from truckNow.
router.post("/map", async (req, res) => {
  try {
    const { truckNow, pickup, delivery } = req.body ?? {};
    const image = await renderRouteMap({
      deadheadOrigin: truckNow,
      pickup,
      delivery,
    });
    return res.status(200).json({ message: "Route map", image });
  } catch (err) {
    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

export default router;
