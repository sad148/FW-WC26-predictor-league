import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { ok, handleError } from '@/lib/responses';

/**
 * GET /api/leaderboard — aggregates bets per user.
 * Wallet = 100 + sum(win wagers) - sum(loss wagers); pending bets don't move it.
 */
export async function GET() {
  try {
    const result = await db.execute<{
      playerId: string;
      name:     string;
      wins:     number;
      losses:   number;
      pending:  number;
      wallet:   number;
      pts:      number;
    }>(sql`
      SELECT
        u.player_id AS "playerId",
        u.name      AS "name",
        COALESCE(SUM(CASE WHEN b.outcome = 'win'     THEN 1 ELSE 0 END), 0)::int AS "wins",
        COALESCE(SUM(CASE WHEN b.outcome = 'loss'    THEN 1 ELSE 0 END), 0)::int AS "losses",
        COALESCE(SUM(CASE WHEN b.outcome = 'pending' THEN 1 ELSE 0 END), 0)::int AS "pending",
        (100 + COALESCE(SUM(CASE
          WHEN b.outcome = 'win'  THEN b.wager
          WHEN b.outcome = 'loss' THEN -b.wager
          ELSE 0 END), 0))::int AS "wallet",
        COALESCE(SUM(CASE WHEN b.outcome = 'win' THEN b.wager ELSE 0 END), 0)::int AS "pts"
      FROM users u
      LEFT JOIN bets b ON b.user_id = u.id
      GROUP BY u.id, u.player_id, u.name
      ORDER BY "pts" DESC, "wallet" DESC
    `);
    return ok({ leaderboard: result.rows });
  } catch (err) {
    return handleError(err);
  }
}
