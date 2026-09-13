import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  createDriver,
  getDriver,
  getDrivers,
  patchDriver,
  deleteDriver,
} from "../services/driverServices.js";
// The CDL is a compliance clock that happens to live on the driver record, so
// its renewal shares the compliance service's transaction and history table.
import {
  renewDriverCdl,
  getDriverCdlRenewals,
} from "../services/complianceServices.js";

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

// ---- RENEW CDL ----
// Same body as a compliance renewal; the closed cycle is written to
// compliance_renewals against driver_id and the driver's cdl_expiration rolls
// forward. Owner and dispatcher both, like every other renewal.

router.post("/:id/cdl-renew", requireAuth, async (req, res) => {
  try {
    const driver = await renewDriverCdl(
      req.user.user_id,
      req.params.id,
      req.body,
      req.user,
    );

    return res.status(200).json({
      message: "CDL renewed successfully",
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

// ---- CDL RENEWAL HISTORY ----

router.get("/:id/cdl-renewals", requireAuth, async (req, res) => {
  try {
    const renewals = await getDriverCdlRenewals(req.user.user_id, req.params.id);

    return res.status(200).json({
      message: "CDL renewals retrieved successfully",
      count: renewals.length,
      renewals,
    });
  } catch (err) {
    if (err.type === "not_found") {
      return res.status(err.statusCode).json({ error: err.message });
    }

    if (err.type === "validation") {
      return res.status(err.statusCode).json({ error: err.message });
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
