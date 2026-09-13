import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getAgencies,
  getAgency,
  getSettlementOnly,
  createAgency,
  patchAgency,
  deleteAgency,
} from "../services/agencyServices.js";

const router = express.Router();
router.use(requireAuth);

// ---- GET ALL AGENCIES ----
router.get("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const agencies = await getAgencies(user_id);

    return res.status(200).json({
      message: "agencies retrieved successfully",
      count: agencies.length,
      agencies,
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

// ---- GET SETTLEMENT-ONLY HISTORY ----
// MUST stay above /:agency_id — Express matches in order, and the parameter
// route would otherwise swallow "settlement-only" as an agency id.
router.get("/settlement-only", async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const { since, rows } = await getSettlementOnly(user_id, req.query.since);

    return res.status(200).json({
      message: "settlement-only history retrieved successfully",
      count: rows.length,
      since,
      rows,
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

// ---- GET AGENCY BY ID ----
router.get("/:agency_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const agency_id = req.params.agency_id;

    const agency = await getAgency(user_id, agency_id);

    return res.status(200).json({
      message: "agency retrieved successfully",
      agency,
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

// ---- CREATE AGENCY ----
router.post("/", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const data = req.body;

    const agency = await createAgency(user_id, data);

    return res.status(201).json({
      message: "agency created successfully",
      agency,
    });
  } catch (err) {
    // agencies are UNIQUE(user_id, agency_code) — unique_agency_code_per_user.
    // A code already on the book is the user's call, not a raw Postgres 500.
    if (err.code === "23505") {
      return res.status(409).json({
        error: "That agency code is already on file.",
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

// ---- PATCH AGENCY ----

router.patch("/:agency_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const agency_id = req.params.agency_id;
    const data = req.body;

    const agency = await patchAgency(user_id, agency_id, data);

    return res.status(200).json({
      message: "agency updated successfully",
      agency,
    });
  } catch (err) {
    // Recoding an agency onto a code already on the book — same 409.
    if (err.code === "23505") {
      return res.status(409).json({
        error: "That agency code is already on file.",
      });
    }

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

// ---- DELETE AGENCY ----

router.delete("/:agency_id", async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const agency_id = req.params.agency_id;

    const agency = await deleteAgency(user_id, agency_id);

    return res.status(200).json({
      message: "agency deleted successfully",
      agency,
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
