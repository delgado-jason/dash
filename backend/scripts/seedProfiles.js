import "dotenv/config";
import { db } from "../db/pool.js";

const sampleProfiles = [
  {
    first_name: "Jason",
    last_name: "Delgado",
    phone_num: "2145550199",
    company_name: "Delgado Trucking Services",
    carrier_type: "Owner Op",
    owns_trailer: true,
    home_address: "1800 Commerce St",
    home_city: "Dallas",
    home_state: "TX",
  },
  {
    first_name: "Maya",
    last_name: "Reed",
    phone_num: "8175550142",
    company_name: "Delgado Trucking Services",
    carrier_type: "Company Lease",
    owns_trailer: false,
    home_address: "410 W 7th St",
    home_city: "Fort Worth",
    home_state: "TX",
  },
  {
    first_name: "Carlos",
    last_name: "Vega",
    phone_num: "9725550188",
    company_name: "Delgado Trucking Services",
    carrier_type: "Leased Owner Op",
    owns_trailer: true,
    home_address: "9220 Skillman St",
    home_city: "Dallas",
    home_state: "TX",
  },
  {
    first_name: "Tanya",
    last_name: "Brooks",
    phone_num: "4695550177",
    company_name: "Delgado Trucking Services",
    carrier_type: "Company Lease",
    owns_trailer: false,
    home_address: "301 E Main St",
    home_city: "Lewisville",
    home_state: "TX",
  },
];

async function seedProfiles() {
  try {
    console.log("Seeding profiles...");

    const users = await db.query(
      `SELECT user_id, email FROM users ORDER BY created_at ASC`,
    );

    if (users.rowCount === 0) {
      console.log("No users found. Seed users first.");
      process.exit(1);
    }

    // assign a profile template to each user (cycles if more users than templates)
    for (let i = 0; i < users.rows.length; i++) {
      const u = users.rows[i];
      const p = sampleProfiles[i % sampleProfiles.length];

      await db.query(
        `
        INSERT INTO profiles (
          user_id,
          first_name,
          last_name,
          phone_num,
          company_name,
          carrier_type,
          owns_trailer,
          home_address,
          home_city,
          home_state,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT (user_id) DO NOTHING
        `,
        [
          u.user_id,
          p.first_name,
          p.last_name,
          p.phone_num,
          p.company_name,
          p.carrier_type,
          p.owns_trailer,
          p.home_address,
          p.home_city,
          p.home_state,
        ],
      );

      console.log(`Inserted/kept profile for ${u.email}`);
    }

    console.log("✅ Profiles seeded.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  }
}

seedProfiles();
