import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getTrips,
  getTrip,
  getLatestOdometer,
  createTrip,
  patchTrip,
  deleteTrip,
} from "../services/tripServices.js";

const router = express.Router();
router.use(requireAuth);

// ---- GET ALL TRIPS ----

router.get("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const trips = await getTrips(user_id);

    return res.status(200).json({
      message: "Trips retrieved successfully",
      count: trips.length,
      trips,
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

// ---- GET LATEST ODOMETER ----
// MUST be declared before "/:id" or Express matches "latest-odometer" as an id.

router.get("/latest-odometer", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const latest_odometer = await getLatestOdometer(user_id);

    return res.status(200).json({
      message: "Latest odometer retrieved successfully",
      latest_odometer,
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

// ---- GET TRIP BY ID ----

router.get("/:id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const trip_id = req.params.id;

    const trip = await getTrip(user_id, trip_id);

    return res.status(200).json({
      message: "Trip retrieved successfully",
      trip,
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

// ---- CREATE TRIP ----
router.post("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const data = req.body;

    const trip = await createTrip(user_id, data);

    return res.status(201).json({
      message: "Trip created successfully",
      trip,
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

// ---- PATCH TRIP ----

router.patch("/:id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const trip_id = req.params.id;
    const data = req.body;

    const trip = await patchTrip(user_id, trip_id, data);

    return res.status(200).json({
      message: "Trip updated successfully",
      trip,
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

// ---- DELETE TRIP ----

router.delete("/:id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const trip_id = req.params.id;

    const trip = await deleteTrip(user_id, trip_id);

    return res.status(200).json({
      message: "Trip deleted successfully",
      trip,
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
