import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { ok, handleError } from '@/lib/responses';

/**
 * GET /api/leaderboard — aggregates per user.
 *   wallet     = 100 + sum(win pointsAwarded) - sum(loss wagers)
 *   matchPts   = sum(win pointsAwarded)
 *   triviaPts  = sum(question_answers.points_awarded)   (Subsystem B)
 *   bracketPts = sum(bracket_picks.points_awarded)      (Subsystem C Phase 2, 3 pts per correct pick)
 *   groupPts   = sum(group_picks.points_awarded)        (Subsystem C Phase 1, 1 pt per correct position)
 *   totalPts   = wallet + triviaPts + bracketPts + groupPts
 * Ranked by totalPts desc, then wins desc, then wallet desc.
 * LATERAL subqueries avoid cross-products.
 */
export async function GET() {
  try {
    const result = await db.execute<{
      playerId:   string;
      name:       string;
      wins:       number;
      losses:     number;
      pending:    number;
      wallet:     number;
      matchPts:   number;
      triviaPts:  number;
      bracketPts: number;
      groupPts:   number;
      totalPts:   number;
    }>(sql`
      SELECT
        u.id::text      AS "playerId",
        u.name          AS "name",
        m.wins          AS "wins",
        m.losses        AS "losses",
        m.pending       AS "pending",
        m.wallet        AS "wallet",
        m.match_pts     AS "matchPts",
        t.trivia_pts    AS "triviaPts",
        b.bracket_pts   AS "bracketPts",
        g.group_pts     AS "groupPts",
        (m.wallet + t.trivia_pts + b.bracket_pts + g.group_pts)::int AS "totalPts"
      FROM users u
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(CASE WHEN outcome = 'win'     THEN 1 ELSE 0 END), 0)::int AS wins,
          COALESCE(SUM(CASE WHEN outcome = 'loss'    THEN 1 ELSE 0 END), 0)::int AS losses,
          COALESCE(SUM(CASE WHEN outcome = 'pending' THEN 1 ELSE 0 END), 0)::int AS pending,
          (100 + COALESCE(SUM(CASE
            WHEN outcome = 'win'  THEN points_awarded
            WHEN outcome = 'loss' THEN -wager
            ELSE 0 END), 0))::int AS wallet,
          COALESCE(SUM(CASE WHEN outcome = 'win' THEN points_awarded ELSE 0 END), 0)::int AS match_pts
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
      ORDER BY "totalPts" DESC, "wins" DESC, "wallet" DESC
    `);
    return ok({ leaderboard: result.rows });
  } catch (err) {
    return handleError(err);
  }
}
