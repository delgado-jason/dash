import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { listNotes } from "../services/agentNoteService.js";

// Flat, read-only router (like /agent-coverage) beside the nested
// /agents/:agent_id/notes writer: the Relationships surface needs every
// agent's notes in ONE read to know which nurture flags were skipped
// ("[milestone:loads-5:skipped]" lives in an agent note, never a contact).
const router = express.Router();
router.use(requireAuth);

// ---- LIST ALL AGENT NOTES ----
router.get("/", async (req, res) => {
  try {
    const notes = await listNotes(req.user.user_id);

    return res.status(200).json({ message: "Agent notes", notes });
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

export default router;
