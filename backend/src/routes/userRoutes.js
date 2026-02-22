import express from "express";
import { db } from "../../db/pool.js";
const router = express.Router();

router.get("/", async (req, res, next) => {
  const result = await db.query(`SELECT * FROM users`);

  const data = result.rows;
  res.send(data.map((user) => user.email));
});

export default router;
