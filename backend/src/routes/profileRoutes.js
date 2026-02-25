import express from "express";
import { db } from "../../db/pool.js";
import bcrypt from "bcrypt";

const router = express.Router();

// ---- GET ALL PROFILES ----
router.get("/", async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM profiles`);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Profiles not found" });
    }
    res.status(200).json(result.rows.map((profile) => profile));
  } catch (err) {
    res.status(500).json({ errMessage: err });
  }
});

export default router;
