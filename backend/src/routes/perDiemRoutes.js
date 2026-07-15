import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getPerDiemDays,
  getLastHomeDay,
  upsertPerDiemDay,
  deletePerDiemDay,
} from "../services/perDiemServices.js";

const router = express.Router();
router.use(requireAuth);

// ---- GET the last home day (for the hometime metric) ----
// Declared before "/" so the literal path matches ahead of the year list.
router.get("/last-home", async (req, res) => {
  try {
    const result = await getLastHomeDay(req.user.user_id);
    return res.status(200).json(result);
  } catch (err) {
    if (err.type === "validation")
      return res.status(err.statusCode).json({ error: err.message });
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

// ---- GET a year's marked days ----
router.get("/", async (req, res) => {
  try {
    const days = await getPerDiemDays(req.user.user_id, req.query.year);
    return res
      .status(200)
      .json({ message: "Per-diem days retrieved", count: days.length, days });
  } catch (err) {
    if (err.type === "validation")
      return res.status(err.statusCode).json({ error: err.message });
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

// ---- UPSERT a day ----
router.put("/", async (req, res) => {
  try {
    const { day, status } = req.body;
    const saved = await upsertPerDiemDay(req.user.user_id, day, status);
    return res.status(200).json({ message: "Per-diem day saved", day: saved });
  } catch (err) {
    if (err.type === "validation")
      return res.status(err.statusCode).json({ error: err.message });
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

// ---- CLEAR a day ----
router.delete("/:day", async (req, res) => {
  try {
    const result = await deletePerDiemDay(req.user.user_id, req.params.day);
    return res.status(200).json({ message: "Per-diem day cleared", ...result });
  } catch (err) {
    if (err.type === "validation")
      return res.status(err.statusCode).json({ error: err.message });
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

export default router;
