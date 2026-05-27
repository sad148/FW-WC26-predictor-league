import { NextRequest } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/db/client';
import { leagues, audit } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

/** GET /api/league — returns the current (most recently created) league or null. */
export async function GET() {
  try {
    const [league] = await db.select().from(leagues).orderBy(desc(leagues.createdAt)).limit(1);
    return ok({ league: league ?? null });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/league — admin creates a new league. Existing players stay registered. */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const name = String(body.name || '').trim();
    if (!name) return fail('League name is required.');

    const code = 'WC26-' + Math.random().toString(36).toUpperCase().slice(2, 6);
    const [row] = await db.insert(leagues).values({ name, code }).returning();
    await db.insert(audit).values({ action: 'createLeague', detail: { name, code } });
    return ok({ league: row }, 201);
  } catch (err) {
    return handleError(err);
  }
}
