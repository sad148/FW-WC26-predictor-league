import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { groupEntries, groupPicks, bracketPhases } from '@/db/schema';
import { requireActiveLeague } from '@/lib/session';
import { HttpError } from '@/lib/errors';
import { ok, fail, handleError } from '@/lib/responses';

/** GET /api/group-picks — list current user's group ranking picks for the active league. */
export async function GET() {
  try {
    const session = await requireActiveLeague();
    const rows = await db.select().from(groupPicks).where(and(
      eq(groupPicks.userId, session.userId!),
      eq(groupPicks.leagueId, session.activeLeagueId),
    ));
    return ok({ picks: rows });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/group-picks — submit or update a group ranking for the active league. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireActiveLeague();
    if (session.isAdmin) {
      throw new HttpError(403, 'Admin accounts cannot submit group picks. Use a player account.');
    }

    const body     = await req.json();
    const groupId  = parseInt(String(body.groupId), 10);
    const ranking  = String(body.ranking || '').trim();
    const leagueId = session.activeLeagueId;

    if (isNaN(groupId)) return fail('groupId is required.');
    if (!ranking)       return fail('ranking is required.');

    const [group] = await db.select().from(groupEntries).where(eq(groupEntries.id, groupId));
    if (!group)                     return fail('Group not found.', 404);
    if (group.status === 'settled') return fail('This group has already been settled.', 409);

    const teams  = group.teams.split('|').map(t => t.trim().toLowerCase());
    const picked = ranking.split('|').map(t => t.trim().toLowerCase());
    if (picked.length !== 4) return fail('ranking must contain exactly 4 pipe-separated teams.');
    if ([...new Set(picked)].length !== 4) return fail('Each team must appear exactly once.');
    if (picked.some(t => !teams.includes(t))) return fail('ranking contains a team not in this group.');

    const [window] = await db.select().from(bracketPhases).where(eq(bracketPhases.phase, 1));
    const now = new Date();
    if (!window || !window.startTime || !window.endTime) {
      return fail('Phase 1 bracket window is not set yet.', 409);
    }
    if (now < window.startTime) return fail('Phase 1 bracket hasn\'t opened yet.', 409);
    if (now >= window.endTime)  return fail('Phase 1 bracket window has closed.', 409);

    const [row] = await db.insert(groupPicks)
      .values({ userId: session.userId!, leagueId, groupId, ranking })
      .onConflictDoUpdate({
        target: [groupPicks.userId, groupPicks.groupId, groupPicks.leagueId],
        set:    { ranking, pointsAwarded: 0 },
      })
      .returning();

    return ok({ pick: row }, 201);
  } catch (err) {
    return handleError(err);
  }
}
