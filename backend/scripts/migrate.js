import "dotenv/config";
import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";
import { db } from "../db/pool.js";

// recreate dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  try {
    const migrationsDir = path.join(__dirname, "../db/migrations");

    // Read all .sql files
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort(); // ensures 001_, 002_, 003_ order

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf8");

      console.log(`Running migration: ${file}`);
      await db.pool.query(sql);
    }

    console.log("All migrations completed.");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

runMigrations();
