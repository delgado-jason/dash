import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireServiceToken } from "../middleware/requireServiceToken.js";
import {
  getDocumentsForLoad,
  loadExists,
  registerDocument,
} from "../services/documentServices.js";

const router = express.Router();

// People (admin + dispatcher) read a load's paperwork.
router.get("/load/:load_id", requireAuth, async (req, res) => {
  try {
    const documents = await getDocumentsForLoad(req.user.user_id, req.params.load_id);
    return res.status(200).json({
      message: "Documents retrieved successfully",
      count: documents.length,
      documents,
    });
  } catch (err) {
    if (err.type === "validation") return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
});

// The vault's gate: the DTS server asks BEFORE it creates a load folder
// (Vault Door Nod Sheet, decision 10). The status is the answer the robot
// reads — 200 the load exists, 404 it doesn't — and the body says the same
// thing for a human. Service token only, like /ingest.
router.get("/load-exists", requireServiceToken, async (req, res) => {
  try {
    const found = await loadExists(req.user.user_id, req.query.load_number);
    if (!found.exists) {
      return res.status(404).json({ ...found, error: `No load with number ${found.load_number}` });
    }
    return res.status(200).json(found);
  } catch (err) {
    if (err.type === "validation") return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
});

// The DTS server's ingest agent registers a filed document (service token).
router.post("/ingest", requireServiceToken, async (req, res) => {
  try {
    const { document, created } = await registerDocument(req.user.user_id, req.body);
    return res.status(created ? 201 : 200).json({
      message: created ? "Document registered" : "Document already registered",
      created,
      document,
    });
  } catch (err) {
    if (err.type === "validation") return res.status(err.statusCode).json({ error: err.message });
    if (err.type === "not_found") return res.status(err.statusCode).json({ error: err.message });
    return res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
});

export default router;
