import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getAgents,
  getAgent,
  createAgent,
  patchAgent,
  deleteAgent,
} from "../services/agentServices.js";

const router = express.Router();
router.use(requireAuth);

// ---- GET ALL AGENTS ----
router.get("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const agents = await getAgents(user_id);

    return res.status(200).json({
      message: "Agents retrieved successfully",
      count: agents.length,
      agents,
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

// ---- GET AGENT BY ID ----
router.get("/:agent_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const agent_id = req.params.agent_id;

    const { agent, loads, notes } = await getAgent(user_id, agent_id);

    return res.status(200).json({
      message: "Agent retrieved successfully",
      agent,
      loads,
      notes,
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

// ---- CREATE AGENT ----
router.post("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const data = req.body;

    const agent = await createAgent(user_id, data);

    return res.status(201).json({
      message: "Agent created successfully",
      agent,
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

// ---- PATCH AGENT ----

router.patch("/:agent_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const agent_id = req.params.agent_id;
    const data = req.body;

    const agent = await patchAgent(user_id, agent_id, data);

    return res.status(200).json({
      message: "Agent updated successfully",
      agent,
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

// ---- DELETE AGENT ----

router.delete("/:agent_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const agent_id = req.params.agent_id;

    const agent = await deleteAgent(user_id, agent_id);

    return res.status(200).json({
      message: "Agent deleted successfully",
      agent,
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
