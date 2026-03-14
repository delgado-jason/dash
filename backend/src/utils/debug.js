import { db } from "../../db/pool.js";

const r = await db.query(
  "SELECT current_database() AS db, current_schema() AS schema",
);
console.log(r.rows[0]);
