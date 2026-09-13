import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getAgents,
  getAgent,
  createAgent,
  patchAgent,
  deleteAgent,
} from "../services/agentServices.js";
import { holdTier } from "../services/agentTierHistoryServices.js";

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

    const { agent, loads, notes, ratingHistory } = await getAgent(
      user_id,
      agent_id,
    );

    return res.status(200).json({
      message: "Agent retrieved successfully",
      agent,
      loads,
      notes,
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
    // agents are UNIQUE(first_name, last_name, user_id): adding a person who is
    // already on the book is a decision for the user, not a raw Postgres 500.
    if (err.code === "23505") {
      return res.status(409).json({
        error: "An agent with that name is already on your book.",
      });
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

// ---- PATCH AGENT ----

router.patch("/:agent_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const agent_id = req.params.agent_id;
    const data = req.body;

    // req.user carries who is acting (role, self_id) — the tier rule needs it.
    const agent = await patchAgent(user_id, agent_id, data, req.user);

    return res.status(200).json({
      message: "Agent updated successfully",
      agent,
    });
  } catch (err) {
    // agents are UNIQUE(first_name, last_name, user_id): renaming onto a name
    // already on the book is a decision for the user, not a raw Postgres 500.
    if (err.code === "23505") {
      return res.status(409).json({
        error: "An agent with that name is already on your book.",
      });
    }

    if (err.type === "not_found" || err.type === "forbidden_error") {
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

// ---- HOLD A TIER SUGGESTION ----
// The owner's "not now" on a re-tier suggestion (REL-01 v2.0 §5G): a history
// row with from = to = the current tier and the evidence in its reason, so
// the Review stops asking until the numbers change. Owner only, like the tier
// itself; the agent row is untouched.
router.post("/:agent_id/tier-hold", async (req, res) => {
  try {
    const history = await holdTier(req.user.user_id, req.params.agent_id, req.body, req.user);
    return res.status(201).json({ message: "Hold recorded", history });
  } catch (err) {
    if (err.type === "not_found" || err.type === "forbidden_error") {
      return res.status(err.statusCode).json({ error: err.message });
    }
    if (err.type === "validation") {
      return res.status(err.statusCode).json({ error: err.message, details: err.details });
    }
    return res.status(500).json({ error: "Internal Server Error", message: err.message });
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
    // FK restraint is doctrine, not an accident: loads, notes and rating
    // history are ON DELETE RESTRICT so the paper trail can't be orphaned.
    // Surface that as a decision, not a raw Postgres 500 (handoff §7h).
    if (err.code === "23503") {
      return res.status(409).json({
        error: "Agent has history",
        message:
          "This agent has loads, notes, or rating history on record — " +
          "records are never orphaned. Park the agent instead of deleting.",
      });
    }

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
