import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { leagues, leagueMembers } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

/** POST /api/league/join — logged-in user joins a new league by code. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();
    const body    = await req.json();
    const code    = String(body.leagueCode || '').trim().toUpperCase();
    if (!code) return fail('League code is required.');

    const [league] = await db.select().from(leagues).where(eq(leagues.code, code));
    if (!league) return fail('Invalid league code.');

    const existing = await db
      .select()
      .from(leagueMembers)
      .where(eq(leagueMembers.userId, session.userId!))
      .then(rows => rows.find(r => r.leagueId === league.id));
    if (existing) return fail('You are already a member of this league.', 409);

    await db.insert(leagueMembers).values({ userId: session.userId!, leagueId: league.id });

    return ok({ league: { id: league.id, name: league.name, code: league.code } }, 201);
  } catch (err) {
    return handleError(err);
  }
}
