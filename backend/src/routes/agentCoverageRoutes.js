import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  listCoverage,
  createCoverage,
  deleteCoverage,
} from "../services/agentCoverageService.js";

// Flat router (like /agent-contacts) rather than nested under an agent: the
// Foreman needs every agent's coverage in one read to rank a market, and the
// qualification screen only ever works one agent at a time anyway.
const router = express.Router();
router.use(requireAuth);

// ---- LIST ALL COVERAGE ----
router.get("/", async (req, res) => {
  try {
    const coverage = await listCoverage(req.user.user_id);

    return res.status(200).json({ message: "Agent coverage", coverage });
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

// ---- CREATE COVERAGE ----
router.post("/", async (req, res) => {
  try {
    const coverage = await createCoverage(req.user.user_id, req.body);

    return res.status(201).json({
      message: "Coverage saved successfully",
      coverage,
    });
  } catch (err) {
    if (err.type === "validation") {
      return res.status(err.statusCode).json({
        error: err.message,
        details: err.details,
      });
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

// ---- DELETE COVERAGE ----
router.delete("/:coverage_id", async (req, res) => {
  try {
    const coverage = await deleteCoverage(
      req.user.user_id,
      req.params.coverage_id,
    );

    return res.status(200).json({
      message: "Coverage deleted successfully",
      coverage,
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
