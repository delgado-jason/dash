import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getFuelEntries,
  getFuelEntry,
  createFuelEntry,
  patchFuelEntry,
  deleteFuelEntry,
} from "../services/fuelEntryServices.js";
import { getNationalDiesel } from "../services/fuelPriceService.js";

const router = express.Router();
router.use(requireAuth);

// ---- GET ALL FUEL ENTRIES ----
router.get("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const truck_id = req.query.truck_id;

    const fuel_entries = await getFuelEntries(user_id, truck_id);

    return res.status(200).json({
      message: "Fuel entries retrieved successfully",
      count: fuel_entries.length,
      fuel_entries,
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

// ---- NATIONAL DIESEL PRICE (EIA proxy, cached) ----
// Must sit before the "/:fuel_entry_id" matcher so it isn't read as an id.
router.get("/national-diesel", async (req, res) => {
  try {
    const diesel = await getNationalDiesel();
    return res.status(200).json({ diesel });
  } catch (err) {
    // A blip at EIA should never break the fuel page — degrade to null.
    return res.status(200).json({ diesel: null, message: err.message });
  }
});

// ---- GET FUEL ENTRY BY ID ----
router.get("/:fuel_entry_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const fuel_entry_id = req.params.fuel_entry_id;

    const fuel_entry = await getFuelEntry(user_id, fuel_entry_id);

    return res.status(200).json({
      message: "Fuel entry retrieved successfully",
      fuel_entry,
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

// ---- CREATE FUEL ENTRY ----
router.post("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { truck_id, trip_id, ...data } = req.body;

    const fuel_entry = await createFuelEntry(user_id, truck_id, trip_id, data);

    return res.status(201).json({
      message: "Fuel entry created successfully",
      fuel_entry,
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

// ---- PATCH FUEL ENTRY ----

router.patch("/:fuel_entry_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const fuel_entry_id = req.params.fuel_entry_id;
    const data = req.body;

    const fuel_entry = await patchFuelEntry(user_id, fuel_entry_id, data);

    return res.status(200).json({
      message: "Fuel entry updated successfully",
      fuel_entry,
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

// ---- DELETE FUEL ENTRY ----

router.delete("/:fuel_entry_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const fuel_entry_id = req.params.fuel_entry_id;

    const fuel_entry = await deleteFuelEntry(user_id, fuel_entry_id);

    return res.status(200).json({
      message: "Fuel entry deleted successfully",
      fuel_entry,
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
