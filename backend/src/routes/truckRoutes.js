import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getTrucks,
  getTruck,
  patchTruck,
  deleteTruck,
} from "../services/truckServices.js";

const router = express.Router();

// ---- GET ALL TRUCKS ----

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user_id = req.user.user_id;

    const trucks = await getTrucks(user_id);

    return res.status(200).json({
      message: "Trucks retrieved successfully",
      count: trucks.length,
      trucks,
    });
  } catch (err) {
    console.error("GET /trucks error:", err);

    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

// ---- GET TRUCK BY ID ----

router.get("/me/:id", requireAuth, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const truck_id = req.params.id;

    const truck = await getTruck(user_id, truck_id);

    return res.status(200).json({
      message: "Truck retrieved successfully",
      truck,
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

// ---- PATCH TRUCK ----

router.patch("/me/:id", requireAuth, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const truck_id = req.params.id;
    const data = req.body;

    const truck = await patchTruck(user_id, truck_id, data);

    return res.status(200).json({
      message: "Patch was successful",
      truck,
    });
  } catch (err) {
    if (err.type === "not_found") {
      return res.status(err.statusCode).json({ error: err.message });
    }

    if (err.type === "validation") {
      return res.status(err.statusCode).json({
        error: err.message,
        details: err.details,
        statusCode: err.statusCode,
      });
    }

    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

// ---- DELETE TRUCK ----

router.delete("/me/:id", requireAuth, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const truck_id = req.params.id;

    const truck = await deleteTruck(user_id, truck_id);

    return res.status(200).json({
      message: "Truck deleted successfully",
      truck,
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
