import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, leagues, leagueMembers } from '@/db/schema';
import { verifyPassword } from '@/lib/auth';
import { getSession } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

export async function POST(req: NextRequest) {
  try {
    const body     = await req.json();
    const name     = String(body.name || '').trim();
    const password = String(body.password || '');
    if (!name || !password) return fail('Name and password are required.');

    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.name}) = ${name.toLowerCase()}`);
    if (!user) return fail('No account with that name. Register first.', 404);

    const matches = await verifyPassword(password, user.passwordHash);
    if (!matches) return fail('Wrong password.', 401);

    const memberRows = await db
      .select({ id: leagues.id, name: leagues.name, code: leagues.code })
      .from(leagueMembers)
      .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
      .where(eq(leagueMembers.userId, user.id));

    const session = await getSession();
    session.userId  = user.id;
    session.name    = user.name;
    session.isAdmin = false;

    // Auto-set active league when user belongs to exactly one league.
    if (memberRows.length === 1) {
      session.activeLeagueId = memberRows[0].id;
    } else {
      // Clear any stale value; frontend will prompt the user to pick.
      session.activeLeagueId = undefined;
    }
    await session.save();

    return ok({ playerId: String(user.id), name: user.name, leagues: memberRows });
  } catch (err) {
    return handleError(err);
  }
}
