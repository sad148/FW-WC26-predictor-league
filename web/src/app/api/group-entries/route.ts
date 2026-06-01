import { NextRequest } from 'next/server';
import { asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { groupEntries } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

/** GET /api/group-entries — list all groups. Open to anyone. */
export async function GET() {
  try {
    const rows = await db.select().from(groupEntries).orderBy(asc(groupEntries.groupName));
    return ok({ groups: rows });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/group-entries — admin creates a single group entry. */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body      = await req.json();
    const groupName = String(body.groupName || '').trim().toUpperCase();
    const teams     = String(body.teams || '').trim();
    if (!groupName)    return fail('groupName is required.');
    if (!teams)        return fail('teams is required (pipe-separated).');
    if (teams.split('|').filter(Boolean).length < 2) return fail('At least 2 teams required.');

    const [row] = await db.insert(groupEntries).values({ groupName, teams }).returning();
    return ok({ group: row }, 201);
  } catch (err) {
    return handleError(err);
  }
}
