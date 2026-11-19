import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  createDispatcher,
  listAccountUsers,
  getTeamMember,
  updateMyDisplayName,
  changeOwnPassword,
  setPasswordForTeamMember,
} from "../services/userServices.js";

const router = express.Router();

// Team MANAGEMENT (create/remove dispatchers) is owner/admin only.
const adminOnly = (req, res, next) =>
  req.user?.role === "admin"
    ? next()
    : res.status(403).json({ error: "Admin only" });

// A typed error (validation 400, not-found 404, forbidden 403) goes out with
// its own sentence; anything else is a 500.
const sendError = (res, err) =>
  err.statusCode
    ? res.status(err.statusCode).json({ error: err.message })
    : res
        .status(500)
        .json({ error: "Internal Server Error", message: err.message });

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

// ---- UPDATE my own display name ---- any signed-in member sets their own name.
// (Distinct method+path from GET /:id, so no route collision.)
router.patch("/me", requireAuth, async (req, res) => {
  try {
    const raw = req.body?.display_name;
    const name = typeof raw === "string" && raw.trim() ? raw.trim() : null;
    const user = await updateMyDisplayName(req.user.self_id, name);
    return res.status(200).json({ user });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

// ---- CHANGE my own password ---- any member, with the current one. Declared
// before /:id/password so "me" is never read as an id. A wrong current password
// is a 400, not a 401: the browser reads a 401 off any non-login route as a
// dead session and would sign the person out mid-typo.
router.patch("/me/password", requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body ?? {};
    const user = await changeOwnPassword(
      req.user.self_id,
      current_password,
      new_password,
    );
    return res.status(200).json({ message: "Password changed", user });
  } catch (err) {
    return sendError(res, err);
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

// ---- SET a dispatcher's password ---- owner/admin only, and only for a
// dispatcher of this account. No current password: this is the reset for a
// forgotten one — the owner types it and hands it over, as with the first one.
router.patch("/:id/password", requireAuth, adminOnly, async (req, res) => {
  try {
    const user = await setPasswordForTeamMember(
      req.user.account_id,
      req.params.id,
      req.body?.new_password,
    );
    return res.status(200).json({ message: "Password set", user });
  } catch (err) {
    return sendError(res, err);
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
    if (err.type === "validation")
      return res.status(400).json({ error: err.message });
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
