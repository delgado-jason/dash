import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getBrokers,
  getBroker,
  createBroker,
  patchBroker,
  deleteBroker,
} from "../services/brokerServices.js";

const router = express.Router();
router.use(requireAuth);

// ---- GET ALL BROKERS ----
router.get("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const brokers = await getBrokers(user_id);

    return res.status(200).json({
      message: "brokers retrieved successfully",
      count: brokers.length,
      brokers,
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

// ---- GET BROKER BY ID ----
router.get("/:broker_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const broker_id = req.params.broker_id;

    const broker = await getBroker(user_id, broker_id);

    return res.status(200).json({
      message: "broker retrieved successfully",
      broker,
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

// ---- CREATE BROKER ----
router.post("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const data = req.body;

    const broker = await createBroker(user_id, data);

    return res.status(201).json({
      message: "broker created successfully",
      broker,
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

// ---- PATCH BROKER ----

router.patch("/:broker_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const broker_id = req.params.broker_id;
    const data = req.body;

    const broker = await patchBroker(user_id, broker_id, data);

    return res.status(200).json({
      message: "broker updated successfully",
      broker,
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

// ---- DELETE BROKER ----

router.delete("/:broker_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const broker_id = req.params.broker_id;

    const broker = await deleteBroker(user_id, broker_id);

    return res.status(200).json({
      message: "broker deleted successfully",
      broker,
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
