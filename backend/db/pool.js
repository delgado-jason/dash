import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const query = (text, params) => {
  return pool.query(text, params);
};

export const db = {
  pool,
  query,
};
