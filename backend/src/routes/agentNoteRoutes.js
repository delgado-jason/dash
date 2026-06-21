import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { createNote, deleteNote } from "../services/agentNoteService.js";

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

// ---- CREATE AGENT NOTE ----
router.post("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const agent_id = req.params.agent_id;
    const data = req.body;

    const agentNote = await createNote(user_id, agent_id, data);

    return res.status(201).json({
      message: "Note created successfully",
      agentNote,
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

// ---- DELETE AGENT ----

router.delete("/:note_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const note_id = req.params.note_id;

    const agentNote = await deleteNote(user_id, note_id);

    return res.status(200).json({
      message: "Note deleted successfully",
      agentNote,
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
