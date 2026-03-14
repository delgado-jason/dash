// scripts/seed.js
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../db/pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSeeds() {
  try {
    const seedsDir = path.join(__dirname, "../db/seeds");

    const files = fs
      .readdirSync(seedsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    console.log("Seeding database...");

    for (const file of files) {
      const sql = fs.readFileSync(path.join(seedsDir, file), "utf8");
      console.log(`Running seed: ${file}`);
      await db.query(sql);
    }

    console.log("All seeds completed.");
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
}

runSeeds();
