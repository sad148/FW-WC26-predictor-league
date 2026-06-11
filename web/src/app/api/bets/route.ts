import { NextRequest } from 'next/server';
import { and, asc, eq, sql as rawSql } from 'drizzle-orm';
import { db } from '@/db/client';
import { bets, fixtures } from '@/db/schema';
import { requireActiveLeague } from '@/lib/session';
import { HttpError } from '@/lib/errors';
import { ok, fail, handleError } from '@/lib/responses';

/** GET /api/bets — list current user's bets for the active league. */
export async function GET() {
  try {
    const session = await requireActiveLeague();
    const rows = await db
      .select()
      .from(bets)
      .where(and(eq(bets.userId, session.userId!), eq(bets.leagueId, session.activeLeagueId)))
      .orderBy(asc(bets.createdAt));
    return ok({ bets: rows });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/bets — place a new bet for the active league. One per (user, match, league). */
export async function POST(req: NextRequest) {
  try {
    const session = await requireActiveLeague();
    if (session.isAdmin) {
      throw new HttpError(403, 'Admin accounts cannot place bets. Log out and register a player account.');
    }
    const body     = await req.json();
    const matchId  = parseInt(String(body.matchId), 10);
    const wager    = parseInt(String(body.wager), 10);
    const leagueId = session.activeLeagueId;

    if (isNaN(matchId))                        return fail('matchId is required.');
    if (isNaN(wager) || wager < 1 || wager > 8) return fail('Wager must be between 1 and 8.');

    const [match] = await db.select().from(fixtures).where(eq(fixtures.id, matchId));
    if (!match) return fail('Match not found.', 404);

    const now = new Date();
    if (!match.startTime || !match.endTime) {
      return fail('Betting window not set for this match yet.', 409);
    }
    if (now < match.startTime) return fail('Betting hasn\'t opened for this match yet.', 409);
    if (now >= match.endTime)  return fail('Betting window has closed for this match.', 409);
    if (match.scoreA !== null && match.scoreB !== null) {
      return fail('Match result is in; no more bets.', 409);
    }

    const [existing] = await db
      .select()
      .from(bets)
      .where(and(eq(bets.userId, session.userId!), eq(bets.matchId, matchId), eq(bets.leagueId, leagueId)));

    const walletResult = await db.execute<{ wallet: number }>(rawSql`
      SELECT (
        100
        + COALESCE((SELECT SUM(-wager + CASE WHEN outcome != 'pending' THEN points_awarded ELSE 0 END)
                    FROM bets WHERE user_id = ${session.userId} AND league_id = ${leagueId}), 0)
        + COALESCE((SELECT SUM(coins_awarded) FROM bailouts WHERE user_id = ${session.userId} AND league_id = ${leagueId}), 0)
      )::int AS wallet
    `);
    const wallet = walletResult.rows[0]?.wallet ?? 0;
    // wallet already deducted the existing pending wager (if any); add it back for the affordability check
    const available = wallet + (existing?.wager ?? 0);
    if (wager > available) return fail(`Not enough coins. You have ${available} coins available but tried to wager ${wager}.`, 409);

    const [row] = await db
      .insert(bets)
      .values({
        userId:  session.userId!,
        leagueId,
        matchId,
        q1:      body.q1 || null,
        q2:      body.q2 || null,
        q3:      body.q3 || null,
        q4:      body.q4 || null,
        wager,
        outcome: 'pending',
      })
      .onConflictDoUpdate({
        target: [bets.userId, bets.matchId, bets.leagueId],
        set: {
          q1:            body.q1 || null,
          q2:            body.q2 || null,
          q3:            body.q3 || null,
          q4:            body.q4 || null,
          wager,
          outcome:       'pending',
          pointsAwarded: 0,
        },
      })
      .returning();

    return ok({ bet: row }, 201);
  } catch (err) {
    return handleError(err);
  }
}
