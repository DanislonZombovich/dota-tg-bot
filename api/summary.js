import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: "DATABASE_URL environment variable is missing" });
  }

  try {
    const sql = neon(dbUrl);
    const rows = await sql`
      SELECT account_id, player_name, data, updated_at
      FROM account_summary
      WHERE id = 1
      LIMIT 1
    `;

    if (rows.length === 0) {
      return res.status(200).json({
        account_id: "1577649",
        player_name: "Данислон Зомбович-Ликвидонов",
        summary: { total_games: 0, wins: 0, losses: 0, winrate: 0 }
      });
    }

    const row = rows[0];
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({
      account_id: row.account_id,
      player_name: row.player_name,
      summary: row.data,
      updated_at: row.updated_at
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
