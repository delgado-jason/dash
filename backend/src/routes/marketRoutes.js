import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getMarkets,
  getMarket,
  createMarket,
  patchMarket,
  deleteMarket,
} from "../services/marketServices.js";

const router = express.Router();
router.use(requireAuth);

// ---- GET ALL MARKETS ----
router.get("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const markets = await getMarkets(user_id);

    return res.status(200).json({
      message: "markets retrieved successfully",
      count: markets.length,
      markets,
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

// ---- GET Market BY ID ----
router.get("/:market_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const market_id = req.params.market_id;

    const market = await getMarket(user_id, market_id);

    return res.status(200).json({
      message: "Market retrieved successfully",
      market,
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

// ---- CREATE Market ----
router.post("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const data = req.body;

    const market = await createMarket(user_id, data);

    return res.status(201).json({
      message: "Market created successfully",
      market,
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

// ---- PATCH Market ----

router.patch("/:market_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const market_id = req.params.market_id;
    const data = req.body;

    const market = await patchMarket(user_id, market_id, data);

    return res.status(200).json({
      message: "Market updated successfully",
      market,
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

// ---- DELETE Market ----

router.delete("/:market_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const market_id = req.params.market_id;

    const market = await deleteMarket(user_id, market_id);

    return res.status(200).json({
      message: "Market deleted successfully",
      market,
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
