import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getPlans,
  createPlan,
  patchPlan,
  createStage,
  patchStage,
  deleteStage,
  getAccounts,
  createAccount,
  patchAccount,
  getSnapshots,
  createSnapshot,
} from "../services/planServices.js";

const router = express.Router();
router.use(requireAuth);

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

router.get("/", handle(async (req) => ({ plans: await getPlans(req.user.user_id) })));
router.post("/", handle(async (req) => ({ status: 201, body: { plan: await createPlan(req.user.user_id, req.body) } })));
router.patch("/:plan_id", handle(async (req) => ({ plan: await patchPlan(req.user.user_id, req.params.plan_id, req.body) })));
router.post("/:plan_id/stages", handle(async (req) => ({ status: 201, body: { stage: await createStage(req.user.user_id, req.params.plan_id, req.body) } })));
router.patch("/stages/:stage_id", handle(async (req) => ({ stage: await patchStage(req.user.user_id, req.params.stage_id, req.body) })));
router.delete("/stages/:stage_id", handle(async (req) => { await deleteStage(req.user.user_id, req.params.stage_id); return { deleted: true }; }));

router.get("/accounts/all", handle(async (req) => ({ accounts: await getAccounts(req.user.user_id) })));
router.post("/accounts", handle(async (req) => ({ status: 201, body: { account: await createAccount(req.user.user_id, req.body) } })));
router.patch("/accounts/:account_id", handle(async (req) => ({ account: await patchAccount(req.user.user_id, req.params.account_id, req.body) })));

router.get("/snapshots/all", handle(async (req) => ({ snapshots: await getSnapshots(req.user.user_id) })));
router.post("/snapshots", handle(async (req) => ({ status: 201, body: { snapshot: await createSnapshot(req.user.user_id, req.body) } })));

export default router;
