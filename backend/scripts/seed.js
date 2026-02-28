import "dotenv/config";
import bcrypt from "bcrypt";
import { db } from "../db/pool.js";

async function seed() {
  try {
    console.log("Seeding database...");

    const users = [
      { email: "admin@example.com", password: "admin123" },
      {
        email: "alice@example.com",
        password: "password123",
      },
      {
        email: "bob@example.com",
        password: "password123",
      },
    ];

    for (const user of users) {
      const passwordHash = await bcrypt.hash(user.password, 10);

      await db.pool.query(
        `
                INSERT INTO users (email, password_hash)
                VALUES ($1, $2)
                ON CONFLICT (email) DO NOTHING
                `,
        [user.email, passwordHash],
      );

      console.log(`Inserted: ${user.email}`);
    }

    console.log("Seeding complete.");
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
}

seed();
