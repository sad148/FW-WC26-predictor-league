import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { leagues, leagueMembers } from '@/db/schema';
import { getSession } from '@/lib/session';
import { ok, handleError } from '@/lib/responses';

export async function GET() {
  try {
    const session = await getSession();
    if (!session.userId) {
      return ok({ user: null, isAdmin: !!session.isAdmin, activeLeagueId: null, leagues: [] });
    }

    const memberRows = await db
      .select({ id: leagues.id, name: leagues.name, code: leagues.code })
      .from(leagueMembers)
      .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
      .where(eq(leagueMembers.userId, session.userId));

    return ok({
      user:          { userId: session.userId, playerId: String(session.userId), name: session.name },
      isAdmin:       !!session.isAdmin,
      activeLeagueId: session.activeLeagueId ?? null,
      leagues:       memberRows,
    });
  } catch (err) {
    return handleError(err);
  }
}
