import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, audit } from '@/db/schema';
import { verifyPassword } from '@/lib/auth';
import { getSession } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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

    await db.insert(audit).values({ action: 'loginPlayer', detail: { name: user.name, playerId: user.playerId } });

    const session = await getSession();
    session.userId   = user.id;
    session.playerId = user.playerId;
    session.name     = user.name;
    session.isAdmin  = false;   // player and admin sessions are mutually exclusive
    await session.save();

    return ok({ playerId: user.playerId, name: user.name });
  } catch (err) {
    return handleError(err);
  }
}
