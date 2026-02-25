import { Router } from "express";

const router = Router();

router.post("/signup", (req, res) => {
  res.send("User created");
});

router.post("/login", (req, res) => {
  res.send("User logged in");
});

export default router;
