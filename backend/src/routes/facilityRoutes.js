import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getFacilities,
  getFacility,
  createFacility,
  patchFacility,
  deleteFacility,
  mergeFacilities,
} from "../services/facilityServices.js";

const router = express.Router();
router.use(requireAuth);

// ---- MERGE FACILITIES ---- (must precede /:facility_id routes)
router.post("/merge", async (req, res) => {
  try {
    const { keeper_id, merge_ids } = req.body;
    const result = await mergeFacilities(req.user.user_id, keeper_id, merge_ids);
    return res.status(200).json({ message: "Facilities merged", ...result });
  } catch (err) {
    if (err.type === "validation")
      return res.status(err.statusCode).json({ error: err.message });
    if (err.type === "not_found")
      return res.status(err.statusCode).json({ error: err.message });
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

// ---- GET ALL FACILITIES ----
router.get("/", async (req, res) => {
  try {
    const facilities = await getFacilities(req.user.user_id);
    return res.status(200).json({
      message: "Facilities retrieved successfully",
      count: facilities.length,
      facilities,
    });
  } catch (err) {
    if (err.type === "validation")
      return res.status(err.statusCode).json({ error: err.message });
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

// ---- GET FACILITY BY ID ----
router.get("/:facility_id", async (req, res) => {
  try {
    const facility = await getFacility(req.user.user_id, req.params.facility_id);
    return res
      .status(200)
      .json({ message: "Facility retrieved successfully", facility });
  } catch (err) {
    if (err.type === "validation")
      return res.status(err.statusCode).json({ error: err.message });
    if (err.type === "not_found")
      return res.status(err.statusCode).json({ error: err.message });
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

// ---- CREATE FACILITY ----
router.post("/", async (req, res) => {
  try {
    const facility = await createFacility(req.user.user_id, req.body);
    return res
      .status(201)
      .json({ message: "Facility created successfully", facility });
  } catch (err) {
    if (err.type === "validation")
      return res
        .status(err.statusCode)
        .json({ error: err.message, details: err.details });
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

// ---- PATCH FACILITY ----
router.patch("/:facility_id", async (req, res) => {
  try {
    const facility = await patchFacility(
      req.user.user_id,
      req.params.facility_id,
      req.body,
    );
    return res
      .status(200)
      .json({ message: "Facility updated successfully", facility });
  } catch (err) {
    if (err.type === "not_found")
      return res.status(err.statusCode).json({ error: err.message });
    if (err.type === "validation")
      return res
        .status(err.statusCode)
        .json({ error: err.message, details: err.details });
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

// ---- DELETE FACILITY ----
router.delete("/:facility_id", async (req, res) => {
  try {
    const facility = await deleteFacility(
      req.user.user_id,
      req.params.facility_id,
    );
    return res
      .status(200)
      .json({ message: "Facility deleted successfully", facility });
  } catch (err) {
    if (err.type === "validation")
      return res.status(err.statusCode).json({ error: err.message });
    if (err.type === "not_found")
      return res.status(err.statusCode).json({ error: err.message });
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

export default router;
