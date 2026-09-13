import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getTierHistory } from "../services/agentTierHistoryServices.js";

// Mounted at /agents/tier-history — BEFORE /agents in server.js, or the
// agent router's GET /:agent_id would swallow "tier-history" as an id. The
// HOLD write lives on the agent router itself (POST /:agent_id/tier-hold).
const router = express.Router();
router.use(requireAuth);

const handle = (fn) => async (req, res) => {
  try {
    const out = await fn(req);
    return res.status(out?.status ?? 200).json(out?.body ?? out ?? {});
  } catch (err) {
    if (err.type === "validation" || err.type === "not_found" || err.type === "forbidden_error") {
      return res.status(err.statusCode).json({ error: err.message, details: err.details });
    }
    return res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
};

// ?since=YYYY-MM-DD and ?agent_id= are optional filters; the account scope is
// always req.user.user_id.
router.get("/", handle(async (req) => ({ history: await getTierHistory(req.user.user_id, req.query) })));

export default router;
