import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { ok, handleError } from '@/lib/responses';

/**
 * GET /api/leaderboard — aggregates per user.
 *   wallet         = 100 - sum(wagers) + sum(settled pointsAwarded) + sum(bailout coinsAwarded)
 *   matchPts       = sum(win pointsAwarded from bets)
 *   triviaPts      = sum(question_answers.points_awarded)
 *   bracketPts     = sum(bracket_picks + group_picks pointsAwarded)  (3 pts per correct pick)
 *   bailoutPenalty = sum(bailout pointsDeducted)
 *   totalPts       = floor(wallet / 10) + triviaPts + bracketPts - bailoutPenalty  (10 coins = 1 pt)
 * Ranked by totalPts desc, then wallet desc.
 */
export async function GET() {
  try {
    const result = await db.execute<{
      playerId:       string;
      name:           string;
      pending:        number;
      wallet:         number;
      matchPts:       number;
      triviaPts:      number;
      bracketPts:     number;
      bailoutPenalty: number;
      totalPts:       number;
    }>(sql`
      SELECT
        u.id::text      AS "playerId",
        u.name          AS "name",
        m.pending       AS "pending",
        (m.wallet + bo.coins_awarded)::int AS "wallet",
        m.match_pts     AS "matchPts",
        t.trivia_pts    AS "triviaPts",
        (b.bracket_pts + g.group_pts)::int AS "bracketPts",
        bo.points_deducted AS "bailoutPenalty",
        ((m.wallet + bo.coins_awarded) / 10 + t.trivia_pts + b.bracket_pts + g.group_pts - bo.points_deducted)::int AS "totalPts"
      FROM users u
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(CASE WHEN outcome = 'pending' THEN 1 ELSE 0 END), 0)::int AS pending,
          (100 + COALESCE(SUM(
            -wager + CASE WHEN outcome != 'pending' THEN points_awarded ELSE 0 END
          ), 0))::int AS wallet,
          COALESCE(SUM(CASE WHEN outcome != 'pending' THEN points_awarded ELSE 0 END), 0)::int AS match_pts
        FROM bets WHERE user_id = u.id
      ) m ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(points_awarded), 0)::int AS trivia_pts
        FROM question_answers WHERE user_id = u.id AND outcome = 'win'
      ) t ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(points_awarded), 0)::int AS bracket_pts
        FROM bracket_picks WHERE user_id = u.id AND outcome = 'win'
      ) b ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(points_awarded), 0)::int AS group_pts
        FROM group_picks WHERE user_id = u.id
      ) g ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(coins_awarded), 0)::int    AS coins_awarded,
          COALESCE(SUM(points_deducted), 0)::int  AS points_deducted
        FROM bailouts WHERE user_id = u.id
      ) bo ON TRUE
      ORDER BY "totalPts" DESC, "wallet" DESC
    `);
    return ok({ leaderboard: result.rows });
  } catch (err) {
    return handleError(err);
  }
}
