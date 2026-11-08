import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getPerDiemDays,
  getLastHomeDay,
  getHomeDays,
  upsertPerDiemDay,
  deletePerDiemDay,
} from "../services/perDiemServices.js";
import {
  listPerDiemRates,
  createPerDiemRate,
  updatePerDiemRate,
  deletePerDiemRate,
} from "../services/perDiemRateServices.js";

const router = express.Router();
router.use(requireAuth);

// ---- GL-136 dated rates ---- declared before "/" and "/:day" so "/rates" is
// never read as a day.
const rateError = (res, err) => {
  if (err.type === "validation" || err.type === "not_found" || err.type === "conflict")
    return res.status(err.statusCode).json({ error: err.message, details: err.details });
  return res
    .status(500)
    .json({ error: "Internal Server Error", message: err.message });
};

router.get("/rates", async (req, res) => {
  try {
    const rates = await listPerDiemRates(req.user.user_id);
    return res.status(200).json({ rates });
  } catch (err) {
    return rateError(res, err);
  }
});

router.post("/rates", async (req, res) => {
  try {
    const rate = await createPerDiemRate(req.user.user_id, req.body);
    return res.status(201).json({ rate });
  } catch (err) {
    return rateError(res, err);
  }
});

router.patch("/rates/:rate_id", async (req, res) => {
  try {
    const rate = await updatePerDiemRate(req.user.user_id, req.params.rate_id, req.body);
    return res.status(200).json({ rate });
  } catch (err) {
    return rateError(res, err);
  }
});

router.delete("/rates/:rate_id", async (req, res) => {
  try {
    await deletePerDiemRate(req.user.user_id, req.params.rate_id);
    return res.status(204).end();
  } catch (err) {
    return rateError(res, err);
  }
});

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

// ---- GET all home days (for the truck utilization week breakdown) ----
router.get("/home-days", async (req, res) => {
  try {
    const days = await getHomeDays(req.user.user_id);
    return res.status(200).json({ days });
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
