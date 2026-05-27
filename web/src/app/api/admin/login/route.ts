import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

/** POST /api/admin/login — sets session.isAdmin if the password matches ADMIN_PASSWORD env var. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const password = String(body.password || '');
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) return fail('ADMIN_PASSWORD env var not configured.', 500);
    if (password !== expected) return fail('Wrong admin password.', 401);

    // Admin and player sessions are mutually exclusive: clear any player fields
    // when promoting to admin so /api/bets can't be hit from the same session.
    const session = await getSession();
    session.userId   = undefined;
    session.playerId = undefined;
    session.name     = undefined;
    session.isAdmin  = true;
    await session.save();
    return ok();
  } catch (err) {
    return handleError(err);
  }
}
