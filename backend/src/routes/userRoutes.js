import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  createDispatcher,
  listAccountUsers,
  getTeamMember,
} from "../services/userServices.js";

const router = express.Router();

// Team MANAGEMENT (create/remove dispatchers) is owner/admin only.
const adminOnly = (req, res, next) =>
  req.user?.role === "admin"
    ? next()
    : res.status(403).json({ error: "Admin only" });

// ---- LIST the account's team ---- (owner + its dispatchers). Any member may
// read it — it's scoped to their own account_id — so a dispatcher's forms can
// offer booking-credit options (e.g. "Booked by"). Mutations stay adminOnly.
router.get("/", requireAuth, async (req, res) => {
  try {
    const team = await listAccountUsers(req.user.account_id);
    return res.status(200).json({ team });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

// ---- GET one account member ---- for their dispatcher card/page. A user may
// fetch their own identity; an admin may fetch any member of their account.
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId !== req.user.self_id && req.user.role !== "admin")
      return res.status(403).json({ error: "Forbidden" });
    const user = await getTeamMember(req.user.account_id, targetId);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.status(200).json({ user });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

// ---- CREATE a dispatcher ---- under this admin's account. role + parent are
// forced server-side (never trusted from the client), so no privilege escalation.
router.post("/", requireAuth, adminOnly, async (req, res) => {
  try {
    const { email, password, display_name } = req.body;
    const user = await createDispatcher(req.user.account_id, {
      email,
      password,
      display_name,
    });
    return res.status(201).json({ message: "Dispatcher created", user });
  } catch (err) {
    if (err.message === "Missing fields" || err.message === "Invalid email")
      return res.status(400).json({ error: err.message });
    if (err.message === "Email already exists")
      return res.status(409).json({ error: err.message });
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

export default router;
