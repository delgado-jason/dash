import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  saveExpensePeriod,
  getExpensePeriods,
  getExpensePeriod,
  getExpenseCategoryRollup,
  getCategoryDefaults,
  addExpenseLine,
  patchExpenseLine,
  deleteExpenseLine,
} from "../services/expenseServices.js";

const router = express.Router();
router.use(requireAuth);

const handleError = (res, err) => {
  if (err.type === "validation")
    return res
      .status(err.statusCode)
      .json({ error: err.message, details: err.details });
  if (err.type === "not_found")
    return res.status(err.statusCode).json({ error: err.message });
  return res
    .status(500)
    .json({ error: "Internal Server Error", message: err.message });
};

// ---- GET CATEGORY DEFAULTS ---- (before "/:period_id" so it isn't matched as one)
router.get("/defaults", async (req, res) => {
  try {
    const defaults = await getCategoryDefaults(req.user.user_id);
    return res.status(200).json({ defaults });
  } catch (err) {
    return handleError(res, err);
  }
});

// ---- YTD CATEGORY ROLLUP ---- (before "/:period_id" so it isn't matched as one)
router.get("/categories", async (req, res) => {
  try {
    const year = req.query.year ?? new Date().getUTCFullYear();
    const categories = await getExpenseCategoryRollup(req.user.user_id, year);
    return res.status(200).json({ categories });
  } catch (err) {
    return handleError(res, err);
  }
});

// ---- LIST PERIODS ----
router.get("/", async (req, res) => {
  try {
    const periods = await getExpensePeriods(req.user.user_id);
    return res
      .status(200)
      .json({ message: "Expense periods retrieved", count: periods.length, periods });
  } catch (err) {
    return handleError(res, err);
  }
});

// ---- GET ONE PERIOD + LINES ----
router.get("/:period_id", async (req, res) => {
  try {
    const period = await getExpensePeriod(req.user.user_id, req.params.period_id);
    return res.status(200).json({ period });
  } catch (err) {
    return handleError(res, err);
  }
});

// ---- SAVE A CONFIRMED MONTH ----
router.post("/", async (req, res) => {
  try {
    const result = await saveExpensePeriod(req.user.user_id, req.body);
    return res.status(201).json({ message: "Expense period saved", ...result });
  } catch (err) {
    return handleError(res, err);
  }
});

// ---- ADD A LINE ----
router.post("/:period_id/lines", async (req, res) => {
  try {
    const line = await addExpenseLine(
      req.user.user_id,
      req.params.period_id,
      req.body,
    );
    return res.status(201).json({ line });
  } catch (err) {
    return handleError(res, err);
  }
});

// ---- EDIT / RECLASSIFY A LINE ----
router.patch("/lines/:line_id", async (req, res) => {
  try {
    const line = await patchExpenseLine(
      req.user.user_id,
      req.params.line_id,
      req.body,
    );
    return res.status(200).json({ line });
  } catch (err) {
    return handleError(res, err);
  }
});

// ---- DELETE A LINE ----
router.delete("/lines/:line_id", async (req, res) => {
  try {
    const deleted = await deleteExpenseLine(
      req.user.user_id,
      req.params.line_id,
    );
    return res.status(200).json({ deleted });
  } catch (err) {
    return handleError(res, err);
  }
});

export default router;
