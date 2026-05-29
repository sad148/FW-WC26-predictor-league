import { NextRequest } from 'next/server';
import { asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { fixtures, audit } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

/** GET /api/fixtures — list all matches. Open to anyone. */
export async function GET() {
  try {
    const rows = await db.select().from(fixtures).orderBy(asc(fixtures.id));
    return ok({ matches: rows });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/fixtures — add a fixture. Admin only. */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const teamA = String(body.nameA || body.teamA || '').trim();
    const teamB = String(body.nameB || body.teamB || '').trim();
    if (!teamA || !teamB) return fail('Both team names are required.');

    const startTime = body.startTime ? new Date(String(body.startTime)) : null;
    const endTime   = body.endTime   ? new Date(String(body.endTime))   : null;

    const [row] = await db
      .insert(fixtures)
      .values({
        date:      String(body.date || 'TBD'),
        phase:     String(body.phase || 'group'),
        groupName: body.group ? String(body.group) : null,
        teamA,
        teamB,
        flagA:     body.flagA || '⚽',
        flagB:     body.flagB || '⚽',
        venue:     body.venue || null,
        startTime, endTime,
      })
      .returning();

    await db.insert(audit).values({ action: 'addFixture', detail: { id: row.id, teamA, teamB } });
    return ok({ match: row }, 201);
  } catch (err) {
    return handleError(err);
  }
}
