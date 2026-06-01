import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { groupEntries, groupPicks, bracketPhases } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { HttpError } from '@/lib/errors';
import { ok, fail, handleError } from '@/lib/responses';

/** GET /api/group-picks — list current user's group ranking picks. */
export async function GET() {
  try {
    const session = await requireUser();
    const rows = await db.select().from(groupPicks).where(eq(groupPicks.userId, session.userId!));
    return ok({ picks: rows });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/group-picks — submit or update a group ranking.
 * Body: { groupId: number, ranking: string }
 * ranking is pipe-separated 1st→4th: "Brazil|Mexico|Serbia|Argentina"
 * Gated by bracketPhases.phase = 1 window.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();
    if (session.isAdmin) {
      throw new HttpError(403, 'Admin accounts cannot submit group picks. Use a player account.');
    }

    const body    = await req.json();
    const groupId = parseInt(String(body.groupId), 10);
    const ranking = String(body.ranking || '').trim();
    if (isNaN(groupId)) return fail('groupId is required.');
    if (!ranking)       return fail('ranking is required.');

    const [group] = await db.select().from(groupEntries).where(eq(groupEntries.id, groupId));
    if (!group)                      return fail('Group not found.', 404);
    if (group.status === 'settled')  return fail('This group has already been settled.', 409);

    const teams   = group.teams.split('|').map(t => t.trim().toLowerCase());
    const picked  = ranking.split('|').map(t => t.trim().toLowerCase());
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
      .values({ userId: session.userId!, groupId, ranking })
      .onConflictDoUpdate({
        target: [groupPicks.userId, groupPicks.groupId],
        set:    { ranking, pointsAwarded: 0 },
      })
      .returning();

    return ok({ pick: row }, 201);
  } catch (err) {
    return handleError(err);
  }
}
