import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getLoads,
  getLoad,
  createLoad,
  patchLoad,
  deleteLoad,
} from "../services/loadServices.js";

const router = express.Router();
router.use(requireAuth);

// ---- GET ALL LOADS ----
router.get("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const loads = await getLoads(user_id);

    return res.status(200).json({
      message: "Loads retrieved successfully",
      count: loads.length,
      loads,
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

// ---- GET LOAD BY ID ----
router.get("/:load_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const load_id = req.params.load_id;

    const load = await getLoad(user_id, load_id);

    return res.status(200).json({
      message: "Load retrieved successfully",
      load,
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

// ---- CREATE LOAD ----
router.post("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const data = req.body;

    const load = await createLoad(user_id, data);

    return res.status(201).json({
      message: "Load created successfully",
      load,
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

// ---- PATCH LOAD ----

router.patch("/:load_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const load_id = req.params.load_id;
    const data = req.body;

    const load = await patchLoad(user_id, load_id, data);

    return res.status(200).json({
      message: "Load updated successfully",
      load,
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

// ---- DELETE LOAD ----

router.delete("/:load_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const load_id = req.params.load_id;

    const load = await deleteLoad(user_id, load_id);

    return res.status(200).json({
      message: "Load deleted successfully",
      load,
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
