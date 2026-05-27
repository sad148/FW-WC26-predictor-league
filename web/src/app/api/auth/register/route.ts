import { NextRequest } from 'next/server';
import { desc, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, leagues, audit } from '@/db/schema';
import { hashPassword, playerIdFromName } from '@/lib/auth';
import { getSession } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name     = String(body.name || '').trim();
    const password = String(body.password || '');
    const code     = String(body.leagueCode || '').trim().toUpperCase();

    if (!name)                return fail('Name is required.');
    if (password.length < 4)  return fail('Password must be at least 4 characters.');
    if (!code)                return fail('League code is required.');

    // Validate against the most recently created league.
    const [league] = await db.select().from(leagues).orderBy(desc(leagues.createdAt)).limit(1);
    if (!league)                              return fail('No league exists yet. Ask the admin to create one.');
    if (league.code.toUpperCase() !== code)   return fail('Invalid league code.');

    // Case-insensitive uniqueness check.
    const existing = await db
      .select()
      .from(users)
      .where(sql`lower(${users.name}) = ${name.toLowerCase()}`);
    if (existing.length > 0) return fail('Name already taken. Log in instead.', 409);

    const playerId = playerIdFromName(name);
    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({ playerId, name, passwordHash })
      .returning();

    await db.insert(audit).values({ action: 'registerPlayer', detail: { name, playerId } });

    const session = await getSession();
    session.userId   = user.id;
    session.playerId = user.playerId;
    session.name     = user.name;
    session.isAdmin  = false;   // player and admin sessions are mutually exclusive
    await session.save();

    return ok({ playerId: user.playerId, name: user.name }, 201);
  } catch (err) {
    return handleError(err);
  }
}
