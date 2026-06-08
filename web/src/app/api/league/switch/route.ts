import { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { leagueMembers } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

/** POST /api/league/switch — switches the user's active league in the session. */
export async function POST(req: NextRequest) {
  try {
    const session  = await requireUser();
    const body     = await req.json();
    const leagueId = parseInt(String(body.leagueId), 10);
    if (isNaN(leagueId)) return fail('leagueId is required.');

    const [membership] = await db
      .select()
      .from(leagueMembers)
      .where(and(eq(leagueMembers.userId, session.userId!), eq(leagueMembers.leagueId, leagueId)));
    if (!membership) return fail('You are not a member of that league.', 403);

    session.activeLeagueId = leagueId;
    await session.save();

    return ok({ activeLeagueId: leagueId });
  } catch (err) {
    return handleError(err);
  }
}
