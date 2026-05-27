import { NextRequest } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { bets, fixtures, audit } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { HttpError } from '@/lib/errors';
import { ok, fail, handleError } from '@/lib/responses';

/** GET /api/bets — list current user's bets. */
export async function GET() {
  try {
    const session = await requireUser();
    const rows = await db
      .select()
      .from(bets)
      .where(eq(bets.userId, session.userId!))
      .orderBy(asc(bets.createdAt));
    return ok({ bets: rows });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/bets — place a new bet. One per (user, match). */
export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();
    // Defensive: admin and player sessions are mutually exclusive at login,
    // but reject explicitly here in case of a stale cookie pre-fix.
    if (session.isAdmin) {
      throw new HttpError(403, 'Admin accounts cannot place bets. Log out and register a player account.');
    }
    const body = await req.json();
    const matchId = parseInt(String(body.matchId), 10);
    const wager   = parseInt(String(body.wager), 10);
    if (isNaN(matchId))                   return fail('matchId is required.');
    if (isNaN(wager) || wager < 1 || wager > 10) return fail('Wager must be between 1 and 10.');

    const [match] = await db.select().from(fixtures).where(eq(fixtures.id, matchId));
    if (!match)                       return fail('Match not found.', 404);
    if (match.status === 'complete')  return fail('Match already complete; no more bets.', 409);

    const existing = await db
      .select()
      .from(bets)
      .where(and(eq(bets.userId, session.userId!), eq(bets.matchId, matchId)));
    if (existing.length > 0) return fail('You already placed a bet on this match.', 409);

    const [row] = await db
      .insert(bets)
      .values({
        userId:  session.userId!,
        matchId,
        q1:      body.q1 || null,
        q2:      body.q2 || null,
        q3:      body.q3 || null,
        q4:      body.q4 || null,
        wager,
        outcome: 'pending',
      })
      .returning();

    await db.insert(audit).values({
      action: 'saveBet',
      detail: { matchId, wager, userId: session.userId },
    });
    return ok({ bet: row }, 201);
  } catch (err) {
    return handleError(err);
  }
}
