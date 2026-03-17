import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getTripStops,
  getTripStop,
  createTripStop,
  patchTripStop,
  deleteTripStop,
} from "../services/tripStopServices.js";

const router = express.Router();
router.use(requireAuth);

// ---- GET ALL TRIPS STOPS ----

router.get("/:trip_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const trip_id = req.params.trip_id;

    const stops = await getTripStops(user_id, trip_id);

    return res.status(200).json({
      message: "Stops retrieved successfully",
      count: stops.length,
      stops,
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

// ---- GET TRIP STOP BY ID ----

router.get("/:trip_id/:stop_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const trip_id = req.params.trip_id;
    const stop_id = req.params.stop_id;

    const stop = await getTripStop(user_id, trip_id, stop_id);

    return res.status(200).json({
      message: "Stop retrieved successfully",
      stop,
    });
  } catch (err) {
    if (err.type === "validation") {
      return res.status(err.statusCode).json({ error: err.message });
    }

    if (err.type === "not_found") {
      return res.status(err.statusCode).json({ error: err.message });
    }

    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

// ---- CREATE TRIP STOP ----
router.post("/:trip_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const trip_id = req.params.trip_id;
    const data = req.body;

    const stop = await createTripStop(user_id, trip_id, data);

    return res.status(201).json({
      message: "Stop created successfully",
      stop,
    });
  } catch (err) {
    if (err.type === "validation") {
      return res.status(err.statusCode).json({
        error: err.message,
        details: err.details,
      });
    }

    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

// ---- PATCH TRIP STOP ----

router.patch("/:trip_id/:stop_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const trip_id = req.params.trip_id;
    const stop_id = req.params.stop_id;
    const data = req.body;

    const stop = await patchTripStop(user_id, trip_id, stop_id, data);

    return res.status(200).json({
      message: "Stop updated successfully",
      stop,
    });
  } catch (err) {
    if (err.type === "not_found") {
      return res.status(err.statusCode).json({ error: err.message });
    }

    if (err.type === "validation") {
      return res.status(err.statusCode).json({
        error: err.message,
        details: err.details,
      });
    }

    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

// ---- DELETE TRIP STOP ----

router.delete("/:trip_id/:stop_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const trip_id = req.params.trip_id;
    const stop_id = req.params.stop_id;

    const stop = await deleteTripStop(user_id, trip_id, stop_id);

    return res.status(200).json({
      message: "Stop deleted successfully",
      stop,
    });
  } catch (err) {
    if (err.type === "validation") {
      return res.status(err.statusCode).json({ error: err.message });
    }

    if (err.type === "not_found") {
      return res.status(err.statusCode).json({ error: err.message });
    }

    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

export default router;
