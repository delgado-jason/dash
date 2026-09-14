import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getVendors,
  getVendor,
  getUnfiledMaintenanceVendors,
  getDismissedMaintenanceVendors,
  dismissMaintenanceVendor,
  restoreMaintenanceVendor,
  mergeVendorAlias,
  removeVendorAlias,
  createVendor,
  patchVendor,
  deleteVendor,
} from "../services/vendorServices.js";

const router = express.Router();
router.use(requireAuth);

// ---- GET ALL VENDORS ----
router.get("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const vendors = await getVendors(user_id);

    return res.status(200).json({
      message: "Vendors retrieved successfully",
      count: vendors.length,
      vendors,
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

// ---- GET UNFILED MAINTENANCE VENDORS ----
// Must be registered before /:vendor_id or Express would read "unfiled" as an id.
router.get("/unfiled", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const unfiled = await getUnfiledMaintenanceVendors(user_id);

    return res.status(200).json({
      message: "Unfiled maintenance vendors retrieved successfully",
      count: unfiled.length,
      unfiled,
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

// ---- GET DISMISSED ONE-OFF STOPS ----
// Also before /:vendor_id — "dismissed" is a literal segment, not an id.
router.get("/dismissed", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const dismissed = await getDismissedMaintenanceVendors(user_id);

    return res.status(200).json({
      message: "Dismissed maintenance vendors retrieved successfully",
      count: dismissed.length,
      dismissed,
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

// ---- DISMISS A NAME AS A ONE-OFF STOP ----
router.post("/dismissed", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const dismissal = await dismissMaintenanceVendor(
      user_id,
      req.user.self_id,
      req.body,
    );

    return res.status(201).json({
      message: "Marked as a one-off stop",
      dismissal,
    });
  } catch (err) {
    if (err.type === "validation") {
      return res.status(err.statusCode).json({ error: err.message });
    }

    if (err.type === "conflict") {
      return res.status(409).json({ error: err.message });
    }

    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

// ---- UNDO A ONE-OFF ----
router.post("/dismissed/restore", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const dismissal = await restoreMaintenanceVendor(user_id, req.body);

    return res.status(200).json({
      message: "Back on the list",
      dismissal,
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

// ---- GET VENDOR BY ID ----
router.get("/:vendor_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const vendor_id = req.params.vendor_id;

    const { vendor, ratingHistory } = await getVendor(user_id, vendor_id);

    return res.status(200).json({
      message: "Vendor retrieved successfully",
      vendor,
      ratingHistory,
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

// ---- CREATE VENDOR ----
router.post("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const data = req.body;

    const vendor = await createVendor(user_id, data);

    return res.status(201).json({
      message: "Vendor created successfully",
      vendor,
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

// ---- PATCH VENDOR ----
router.patch("/:vendor_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const vendor_id = req.params.vendor_id;
    const data = req.body;

    const vendor = await patchVendor(user_id, vendor_id, data);

    return res.status(200).json({
      message: "Vendor updated successfully",
      vendor,
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

// ---- MERGE A LOG SPELLING INTO THIS VENDOR ----
router.post("/:vendor_id/merge", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const vendor_id = req.params.vendor_id;

    const { vendor, rewritten } = await mergeVendorAlias(
      user_id,
      vendor_id,
      req.body,
    );

    return res.status(200).json({
      message: "Merged into the vendor",
      vendor,
      rewritten,
    });
  } catch (err) {
    if (err.type === "not_found") {
      return res.status(err.statusCode).json({ error: err.message });
    }

    if (err.type === "validation") {
      return res.status(err.statusCode).json({ error: err.message });
    }

    if (err.type === "conflict") {
      return res.status(409).json({ error: err.message });
    }

    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

// ---- DROP AN ALIAS (undo a merge) ----
// The client sends encodeURIComponent(alias); Express hands it back decoded.
router.delete("/:vendor_id/aliases/:alias", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const vendor_id = req.params.vendor_id;

    const vendor = await removeVendorAlias(user_id, vendor_id, req.params.alias);

    return res.status(200).json({
      message: "Alias removed",
      vendor,
    });
  } catch (err) {
    if (err.type === "not_found") {
      return res.status(err.statusCode).json({ error: err.message });
    }

    if (err.type === "validation") {
      return res.status(err.statusCode).json({ error: err.message });
    }

    if (err.type === "conflict") {
      return res.status(409).json({ error: err.message });
    }

    return res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
});

// ---- DELETE VENDOR ----
router.delete("/:vendor_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const vendor_id = req.params.vendor_id;

    const vendor = await deleteVendor(user_id, vendor_id);

    return res.status(200).json({
      message: "Vendor deleted successfully",
      vendor,
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
