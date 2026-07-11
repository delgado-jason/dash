import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getTrophies,
  upsertTrophy,
  deleteTrophy,
} from "../services/trophyServices.js";

const router = express.Router();
router.use(requireAuth);

const handle = (err, res) => {
  if (err.type === "validation")
    return res.status(err.statusCode).json({ error: err.message, details: err.details });
  if (err.type === "not_found")
    return res.status(err.statusCode).json({ error: err.message });
  return res.status(500).json({ error: "Internal Server Error", message: err.message });
};

// ---- LIST ----
router.get("/", async (req, res) => {
  try {
    const trophies = await getTrophies(req.user.user_id);
    return res.status(200).json({ message: "Trophies retrieved", trophies });
  } catch (err) {
    return handle(err, res);
  }
});

// ---- UPSERT one trophy (mark earned / set date / attach art) ----
router.put("/:trophy_key", async (req, res) => {
  try {
    const trophy = await upsertTrophy(req.user.user_id, req.params.trophy_key, req.body);
    return res.status(200).json({ message: "Trophy saved", trophy });
  } catch (err) {
    return handle(err, res);
  }
});

// ---- DELETE ----
router.delete("/:trophy_key", async (req, res) => {
  try {
    const trophy = await deleteTrophy(req.user.user_id, req.params.trophy_key);
    return res.status(200).json({ message: "Trophy removed", trophy });
  } catch (err) {
    return handle(err, res);
  }
});

export default router;
