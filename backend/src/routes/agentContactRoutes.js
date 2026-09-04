import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getAgentContacts,
  createAgentContact,
  deleteAgentContact,
} from "../services/agentContactServices.js";

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

router.get("/", handle(async (req) => ({ contacts: await getAgentContacts(req.user.user_id) })));
router.post("/", handle(async (req) => ({ status: 201, body: { contact: await createAgentContact(req.user.user_id, req.body) } })));
router.delete("/:contact_id", handle(async (req) => { await deleteAgentContact(req.user.user_id, req.params.contact_id); return { deleted: true }; }));

export default router;
