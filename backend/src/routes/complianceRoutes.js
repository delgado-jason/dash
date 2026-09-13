import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getComplianceItems,
  createComplianceItem,
  patchComplianceItem,
  deleteComplianceItem,
  renewComplianceItem,
  getComplianceRenewals,
} from "../services/complianceServices.js";

const router = express.Router();
router.use(requireAuth);

const handle = (err, res) => {
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

// ---- LIST ----
router.get("/", async (req, res) => {
  try {
    const compliance_items = await getComplianceItems(req.user.user_id);
    return res.status(200).json({
      message: "Compliance items retrieved successfully",
      count: compliance_items.length,
      compliance_items,
    });
  } catch (err) {
    return handle(err, res);
  }
});

// ---- CREATE ----
router.post("/", async (req, res) => {
  try {
    const compliance_item = await createComplianceItem(
      req.user.user_id,
      req.body,
    );
    return res
      .status(201)
      .json({ message: "Compliance item created successfully", compliance_item });
  } catch (err) {
    return handle(err, res);
  }
});

// ---- PATCH ----
router.patch("/:compliance_item_id", async (req, res) => {
  try {
    const compliance_item = await patchComplianceItem(
      req.user.user_id,
      req.params.compliance_item_id,
      req.body,
    );
    return res
      .status(200)
      .json({ message: "Compliance item updated successfully", compliance_item });
  } catch (err) {
    return handle(err, res);
  }
});

// ---- RENEW ----
// Owner and dispatcher both renew papers — requireAuth is the whole gate; the
// data is scoped to the account (user_id) while self_id stamps who tapped it.
router.post("/:compliance_item_id/renew", async (req, res) => {
  try {
    const compliance_item = await renewComplianceItem(
      req.user.user_id,
      req.params.compliance_item_id,
      req.body,
      req.user,
    );
    return res
      .status(200)
      .json({ message: "Compliance item renewed successfully", compliance_item });
  } catch (err) {
    return handle(err, res);
  }
});

// ---- RENEWAL HISTORY ----
router.get("/:compliance_item_id/renewals", async (req, res) => {
  try {
    const renewals = await getComplianceRenewals(
      req.user.user_id,
      req.params.compliance_item_id,
    );
    return res.status(200).json({
      message: "Compliance renewals retrieved successfully",
      count: renewals.length,
      renewals,
    });
  } catch (err) {
    return handle(err, res);
  }
});

// ---- DELETE ----
router.delete("/:compliance_item_id", async (req, res) => {
  try {
    const compliance_item = await deleteComplianceItem(
      req.user.user_id,
      req.params.compliance_item_id,
    );
    return res
      .status(200)
      .json({ message: "Compliance item deleted successfully", compliance_item });
  } catch (err) {
    return handle(err, res);
  }
});

export default router;
