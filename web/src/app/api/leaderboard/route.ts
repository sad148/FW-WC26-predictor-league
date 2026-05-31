import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { ok, handleError } from '@/lib/responses';

/**
 * GET /api/leaderboard — aggregates per user.
 *   wallet     = 100 + sum(win match wagers) - sum(loss match wagers)
 *   matchPts   = sum(win match wagers)
 *   triviaPts  = sum(question_answers.points_awarded)
 *   totalPts   = wallet + triviaPts                 (per PRD §4)
 * Ranked by totalPts desc, then wins desc (PRD primary tie-breaker), then wallet desc.
 * LATERAL subqueries avoid a bets×answers cross-product.
 */
export async function GET() {
  try {
    const result = await db.execute<{
      playerId:  string;
      name:      string;
      wins:      number;
      losses:    number;
      pending:   number;
      wallet:    number;
      matchPts:  number;
      triviaPts: number;
      totalPts:  number;
    }>(sql`
      SELECT
        u.player_id     AS "playerId",
        u.name          AS "name",
        m.wins          AS "wins",
        m.losses        AS "losses",
        m.pending       AS "pending",
        m.wallet        AS "wallet",
        m.match_pts     AS "matchPts",
        t.trivia_pts    AS "triviaPts",
        (m.wallet + t.trivia_pts)::int AS "totalPts"
      FROM users u
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(CASE WHEN outcome = 'win'     THEN 1 ELSE 0 END), 0)::int AS wins,
          COALESCE(SUM(CASE WHEN outcome = 'loss'    THEN 1 ELSE 0 END), 0)::int AS losses,
          COALESCE(SUM(CASE WHEN outcome = 'pending' THEN 1 ELSE 0 END), 0)::int AS pending,
          (100 + COALESCE(SUM(CASE
            WHEN outcome = 'win'  THEN wager
            WHEN outcome = 'loss' THEN -wager
            ELSE 0 END), 0))::int AS wallet,
          COALESCE(SUM(CASE WHEN outcome = 'win' THEN wager ELSE 0 END), 0)::int AS match_pts
        FROM bets WHERE user_id = u.id
      ) m ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(points_awarded), 0)::int AS trivia_pts
        FROM question_answers WHERE user_id = u.id AND outcome = 'win'
      ) t ON TRUE
      ORDER BY "totalPts" DESC, "wins" DESC, "wallet" DESC
    `);
    return ok({ leaderboard: result.rows });
  } catch (err) {
    return handleError(err);
  }
}
