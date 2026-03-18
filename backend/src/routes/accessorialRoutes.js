import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getAccessorials,
  createAccessorial,
  patchAccessorial,
  deleteAccessorial,
} from "../services/accessorialServices.js";

const router = express.Router();
router.use(requireAuth);

// ---- GET ALL ACCESSORIALS ----
router.get("/load/:load_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const load_id = req.params.load_id;

    const accessorials = await getAccessorials(user_id, load_id);

    return res.status(200).json({
      message: "Accessorials retrieved successfully",
      count: accessorials.length,
      accessorials,
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

// ---- CREATE ACCESSORIAL ----
router.post("/load/:load_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const load_id = req.params.load_id;
    const data = req.body;

    const accessorial = await createAccessorial(user_id, load_id, data);

    return res.status(201).json({
      message: "Accessorial created successfully",
      accessorial,
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

// ---- PATCH ACCESSORIAL ----

router.patch("/:accessorial_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const accessorial_id = req.params.accessorial_id;
    const data = req.body;

    const accessorial = await patchAccessorial(user_id, accessorial_id, data);

    return res.status(200).json({
      message: "Accessorial updated successfully",
      accessorial,
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

// ---- DELETE ACCESSORIAL ----

router.delete("/:accessorial_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const accessorial_id = req.params.accessorial_id;

    const accessorial = await deleteAccessorial(user_id, accessorial_id);

    return res.status(200).json({
      message: "Accessorial deleted successfully",
      accessorial,
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
