import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: "DATABASE_URL environment variable is missing" });
  }

  const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
  const offset = Math.max(parseInt(req.query.offset || "0", 10), 0);
  const hero = req.query.hero ? `%${req.query.hero.toLowerCase()}%` : null;
  const wonParam = req.query.won;

  try {
    const sql = neon(dbUrl);
    let rows;

    if (hero && wonParam !== undefined) {
      const isWon = wonParam === "true";
      rows = await sql`
        SELECT full_data FROM matches
        WHERE LOWER(hero_name) LIKE ${hero} AND won = ${isWon}
        ORDER BY start_time DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (hero) {
      rows = await sql`
        SELECT full_data FROM matches
        WHERE LOWER(hero_name) LIKE ${hero}
        ORDER BY start_time DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else if (wonParam !== undefined) {
      const isWon = wonParam === "true";
      rows = await sql`
        SELECT full_data FROM matches
        WHERE won = ${isWon}
        ORDER BY start_time DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      rows = await sql`
        SELECT full_data FROM matches
        ORDER BY start_time DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    const matches = rows.map(r => r.full_data);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ matches });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
