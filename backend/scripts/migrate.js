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

    // Create the migrations table
    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        filename TEXT PRIMARY KEY,
        run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );  
    `);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf8");

      // Check if filename already exists in the migrations table
      let result = await db.pool.query(
        `
        SELECT filename
        FROM migrations
        WHERE filename = $1;  
      `,
        [file],
      );

      // If it exists skip and log that it was already run
      if (result.rowCount === 1) {
        console.log(`${file} already ran - skipping`);
        continue;
      }

      console.log(`Running migration: ${file}`);

      await db.pool.query(sql);

      // Add file to the migrations table
      await db.pool.query(`INSERT INTO migrations(filename) VALUES($1);`, [
        file,
      ]);
    }

    console.log("All migrations completed.");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

runMigrations();
