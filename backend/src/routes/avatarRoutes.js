import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { generateAvatar, uploadAvatar } from "../services/avatarService.js";

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

// Generate a themed avatar for a truck/driver/trailer. Body: { variant } for
// driver gender ('male' | 'female').
router.post("/:kind/:id/generate", async (req, res) => {
  try {
    const result = await generateAvatar(
      req.user,
      req.params.kind,
      req.params.id,
      req.body?.variant,
    );
    return res.status(200).json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

// Upload a photo to override the avatar. Send the raw image as the body with an
// image/* Content-Type.
router.post(
  "/:kind/:id/upload",
  express.raw({
    type: ["image/jpeg", "image/png", "image/webp"],
    limit: "5mb",
  }),
  async (req, res) => {
    try {
      if (!req.body || !req.body.length)
        return res.status(400).json({ error: "No image in request body" });
      const result = await uploadAvatar(
        req.user,
        req.params.kind,
        req.params.id,
        req.body,
        req.headers["content-type"],
      );
      return res.status(200).json(result);
    } catch (err) {
      return handleError(res, err);
    }
  },
);

export default router;
