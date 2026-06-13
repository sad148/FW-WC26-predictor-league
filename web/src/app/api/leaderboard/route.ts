import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { getSession } from '@/lib/session';
import { HttpError } from '@/lib/errors';
import { ok, fail, handleError } from '@/lib/responses';

/**
 * GET /api/leaderboard — aggregates per user, scoped to the session's active league.
 *   wallet         = 100 - sum(wagers) + sum(settled pointsAwarded) + sum(bailout coinsAwarded)
 *   matchPts       = sum(win pointsAwarded from bets)
 *   triviaPts      = sum(question_answers.points_awarded)
 *   bracketPts     = sum(bracket_picks + group_picks pointsAwarded)
 *   bailoutPenalty = sum(bailout pointsDeducted)
 *   totalPts       = floor(wallet / 10) + triviaPts + bracketPts - bailoutPenalty
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    let leagueId: number;

    if (session.isAdmin) {
      const lid = parseInt(new URL(req.url).searchParams.get('leagueId') ?? '', 10);
      if (isNaN(lid)) return fail('leagueId query param required for admin.');
      leagueId = lid;
    } else {
      if (!session.userId) throw new HttpError(401, 'Not logged in.');
      if (!session.activeLeagueId) throw new HttpError(400, 'No active league selected.');
      leagueId = session.activeLeagueId;
    }

    const result = await db.execute<{
      playerId:       string;
      name:           string;
      pending:        number;
      wallet:         number;
      fullWallet:     number;
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
        (m.wallet + bo.coins_awarded - fp.coins_deducted)::int AS "wallet",
        (m.full_wallet + bo.coins_awarded - fp.coins_deducted)::int AS "fullWallet",
        m.match_pts     AS "matchPts",
        t.trivia_pts    AS "triviaPts",
        (b.bracket_pts + g.group_pts)::int AS "bracketPts",
        bo.points_deducted AS "bailoutPenalty",
        ((m.wallet + bo.coins_awarded - fp.coins_deducted) / 10 + t.trivia_pts + b.bracket_pts + g.group_pts - bo.points_deducted)::int AS "totalPts"
      FROM users u
      JOIN league_members lm ON lm.user_id = u.id AND lm.league_id = ${leagueId}
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(CASE WHEN outcome = 'pending' THEN 1 ELSE 0 END), 0)::int AS pending,
          (100 + COALESCE(SUM(
            CASE WHEN outcome != 'pending' THEN (-wager + points_awarded) ELSE 0 END
          ), 0))::int AS wallet,
          (100 + COALESCE(SUM(-wager + CASE WHEN outcome != 'pending' THEN points_awarded ELSE 0 END), 0))::int AS full_wallet,
          COALESCE(SUM(CASE WHEN outcome != 'pending' THEN points_awarded ELSE 0 END), 0)::int AS match_pts
        FROM bets WHERE user_id = u.id AND league_id = ${leagueId}
      ) m ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(points_awarded), 0)::int AS trivia_pts
        FROM question_answers WHERE user_id = u.id AND league_id = ${leagueId} AND outcome = 'win'
      ) t ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(points_awarded), 0)::int AS bracket_pts
        FROM bracket_picks WHERE user_id = u.id AND league_id = ${leagueId} AND outcome = 'win'
      ) b ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(points_awarded), 0)::int AS group_pts
        FROM group_picks WHERE user_id = u.id AND league_id = ${leagueId}
      ) g ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(coins_awarded), 0)::int    AS coins_awarded,
          COALESCE(SUM(points_deducted), 0)::int  AS points_deducted
        FROM bailouts WHERE user_id = u.id AND league_id = ${leagueId}
      ) bo ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(coins_deducted), 0)::int AS coins_deducted
        FROM fixture_penalties WHERE user_id = u.id AND league_id = ${leagueId}
      ) fp ON TRUE
      ORDER BY "totalPts" DESC, "wallet" DESC
    `);
    return ok({ leaderboard: result.rows });
  } catch (err) {
    return handleError(err);
  }
}
