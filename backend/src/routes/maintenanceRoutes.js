import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  getMaintenanceItems,
  createMaintenanceItem,
  patchMaintenanceItem,
  deleteMaintenanceItem,
  seedMaintenanceItems,
  getMaintenanceServices,
  createMaintenanceService,
  patchMaintenanceService,
  deleteMaintenanceService,
} from "../services/maintenanceServices.js";

const router = express.Router();
router.use(requireAuth);

const handleError = (res, err) => {
  if (err.type === "validation")
    return res.status(err.statusCode).json({ error: err.message });
  if (err.type === "not_found")
    return res.status(err.statusCode).json({ error: err.message });
  return res
    .status(500)
    .json({ error: "Internal Server Error", message: err.message });
};

// ---- schedule items ----
router.get("/items", async (req, res) => {
  try {
    const items = await getMaintenanceItems(req.user.user_id);
    return res.status(200).json({ items });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/items", async (req, res) => {
  try {
    const item = await createMaintenanceItem(req.user.user_id, req.body);
    return res.status(201).json({ item });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/items/seed", async (req, res) => {
  try {
    const items = await seedMaintenanceItems(req.user.user_id);
    return res.status(201).json({ items });
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch("/items/:id", async (req, res) => {
  try {
    const item = await patchMaintenanceItem(
      req.user.user_id,
      req.params.id,
      req.body,
    );
    return res.status(200).json({ item });
  } catch (err) {
    return handleError(res, err);
  }
});

router.delete("/items/:id", async (req, res) => {
  try {
    const deleted = await deleteMaintenanceItem(req.user.user_id, req.params.id);
    return res.status(200).json({ deleted });
  } catch (err) {
    return handleError(res, err);
  }
});

// ---- services log ----
router.get("/services", async (req, res) => {
  try {
    const services = await getMaintenanceServices(req.user.user_id);
    return res.status(200).json({ services });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/services", async (req, res) => {
  try {
    const service = await createMaintenanceService(req.user.user_id, req.body);
    return res.status(201).json({ service });
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch("/services/:id", async (req, res) => {
  try {
    const service = await patchMaintenanceService(
      req.user.user_id,
      req.params.id,
      req.body,
    );
    return res.status(200).json({ service });
  } catch (err) {
    return handleError(res, err);
  }
});

router.delete("/services/:id", async (req, res) => {
  try {
    const deleted = await deleteMaintenanceService(
      req.user.user_id,
      req.params.id,
    );
    return res.status(200).json({ deleted });
  } catch (err) {
    return handleError(res, err);
  }
});

export default router;
