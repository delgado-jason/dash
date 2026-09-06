import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireServiceToken } from "../middleware/requireServiceToken.js";
import {
  getDocumentsForLoad,
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
