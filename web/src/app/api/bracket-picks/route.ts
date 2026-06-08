import { NextRequest } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { bracketPicks, bracketEntries, bracketPhases } from '@/db/schema';
import { requireActiveLeague } from '@/lib/session';
import { HttpError } from '@/lib/errors';
import { ok, fail, handleError } from '@/lib/responses';

/** GET /api/bracket-picks — list current user's bracket picks for the active league. */
export async function GET() {
  try {
    const session = await requireActiveLeague();
    const rows = await db.select().from(bracketPicks)
      .where(and(
        eq(bracketPicks.userId, session.userId!),
        eq(bracketPicks.leagueId, session.activeLeagueId),
      ))
      .orderBy(asc(bracketPicks.createdAt));
    return ok({ picks: rows });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/bracket-picks — submit or replace a pick for the active league. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireActiveLeague();
    if (session.isAdmin) {
      throw new HttpError(403, 'Admin accounts cannot submit bracket picks. Use a player account.');
    }
    const body     = await req.json();
    const entryId  = parseInt(String(body.entryId), 10);
    const pick     = String(body.pick || '').trim();
    const leagueId = session.activeLeagueId;

    if (isNaN(entryId)) return fail('entryId is required.');
    if (!pick)          return fail('Pick cannot be empty.');

    const [entry] = await db.select().from(bracketEntries).where(eq(bracketEntries.id, entryId));
    if (!entry)                      return fail('Bracket entry not found.', 404);
    if (entry.status === 'settled')  return fail('This bracket entry has already been settled.', 409);
    if (!entry.teams.includes(pick)) return fail('Pick must be one of the listed teams.');

    const [window] = await db.select().from(bracketPhases).where(eq(bracketPhases.phase, 2));
    const now = new Date();
    if (!window || !window.startTime || !window.endTime) {
      return fail('This bracket phase is not open for picks yet.', 409);
    }
    if (now < window.startTime) return fail('This bracket phase hasn\'t opened yet.', 409);
    if (now >= window.endTime)  return fail('This bracket phase is closed.', 409);

    const [row] = await db.insert(bracketPicks).values({
      userId: session.userId!,
      leagueId,
      entryId,
      pick,
    }).onConflictDoUpdate({
      target: [bracketPicks.userId, bracketPicks.entryId, bracketPicks.leagueId],
      set:    { pick, outcome: 'pending', pointsAwarded: 0 },
    }).returning();

    return ok({ pick: row }, 201);
  } catch (err) {
    return handleError(err);
  }
}
