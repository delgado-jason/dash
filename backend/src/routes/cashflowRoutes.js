import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireServiceToken } from "../middleware/requireServiceToken.js";
import {
  feedMonth,
  getAssumptions,
  patchAssumptions,
  getFinancials,
  upsertFinancials,
  getAdjustments,
  setAdjustment,
} from "../services/cashflowServices.js";

const router = express.Router();

const handle = (fn) => async (req, res) => {
  try {
    const out = await fn(req);
    return res.status(out?.status ?? 200).json(out?.body ?? out ?? {});
  } catch (err) {
    if (err.type === "validation" || err.type === "not_found") {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: "Internal Server Error", message: err.message });
  }
};

// Machine read for THE BOOKS console on the DTS server: the same rows the
// app reads, same table, same source of truth — so the two apps can never
// disagree. Registered BEFORE the blanket requireAuth; carries its own gate.
router.get(
  "/financials/service",
  requireServiceToken,
  handle(async (req) => ({ financials: await getFinancials(req.user.user_id) })),
);

// The statement feed writes here — one month, never overwriting an
// archived one (the archive is authoritative; exports fill gaps only).
router.post(
  "/financials/service",
  requireServiceToken,
  handle(async (req) => {
    const r = await feedMonth(req.user.user_id, req.body);
    return {
      status: r.inserted ? 201 : 200,
      body: {
        message: r.inserted
          ? "Month archived from statements"
          : "Month already archived — existing data is authoritative; skipped",
        inserted: r.inserted,
      },
    };
  }),
);

router.use(requireAuth);

router.get("/assumptions", handle(async (req) => ({ assumptions: await getAssumptions(req.user.user_id) })));
router.patch("/assumptions", handle(async (req) => ({ assumptions: await patchAssumptions(req.user.user_id, req.body) })));

router.get("/financials", handle(async (req) => ({ financials: await getFinancials(req.user.user_id) })));
router.post("/financials", handle(async (req) => ({ status: 201, body: { financials: await upsertFinancials(req.user.user_id, req.body.rows) } })));

router.get("/adjustments", handle(async (req) => ({ adjustments: await getAdjustments(req.user.user_id) })));
router.put("/adjustments", handle(async (req) => ({ adjustment: await setAdjustment(req.user.user_id, req.body) })));

export default router;
