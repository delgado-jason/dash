import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getForecastRecords, recordForecast } from "../services/forecastRecordServices.js";

const router = express.Router();
router.use(requireAuth);

const fail = (res, err) => {
  if (err.type === "validation" || err.type === "not_found")
    return res.status(err.statusCode).json({ error: err.message, details: err.details });
  return res.status(500).json({ error: "Internal Server Error", message: err.message });
};

router.get("/", async (req, res) => {
  try {
    const records = await getForecastRecords(req.user.user_id);
    return res.status(200).json({ records });
  } catch (err) {
    return fail(res, err);
  }
});

// Idempotent by design: a second call for the same period answers
// { recorded: false } rather than overwriting the forecast with a later,
// better-informed one.
router.post("/", async (req, res) => {
  try {
    const out = await recordForecast(req.user.user_id, req.body);
    return res.status(out.recorded ? 201 : 200).json(out);
  } catch (err) {
    return fail(res, err);
  }
});

export default router;
