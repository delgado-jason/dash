import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  createDriver,
  getDriver,
  getDrivers,
  patchDriver,
  deleteDriver,
} from "../services/driverServices.js";

const router = express.Router();

// ---- GET ALL DRIVERS ----

router.get("/", requireAuth, async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const drivers = await getDrivers(user_id);

    return res.status(200).json({
      message: "Drivers retrieved successfully",
      count: drivers.length,
      drivers,
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

// ---- GET DRIVER BY ID ----

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const driver_id = req.params.id;

    const driver = await getDriver(user_id, driver_id);

    return res.status(200).json({
      message: "Driver retrieved successfully",
      driver,
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

// ---- CREATE DRIVER ----
router.post("/", requireAuth, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const data = req.body;

    const driver = await createDriver(user_id, data);

    return res.status(201).json({
      message: "Driver created successfully",
      driver,
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

// ---- PATCH DRIVER ----

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const driver_id = req.params.id;
    const data = req.body;

    const driver = await patchDriver(user_id, driver_id, data);

    return res.status(200).json({
      message: "Driver updated successfully",
      driver,
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

// ---- DELETE DRIVER ----

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const driver_id = req.params.id;

    const driver = await deleteDriver(user_id, driver_id);

    return res.status(200).json({
      message: "Driver deleted successfully",
      driver,
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
