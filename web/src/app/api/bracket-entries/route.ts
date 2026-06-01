import { NextRequest } from 'next/server';
import { asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { bracketEntries } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

/** GET /api/bracket-entries — list all entries. Open to anyone. */
export async function GET() {
  try {
    const rows = await db.select().from(bracketEntries)
      .orderBy(asc(bracketEntries.phase), asc(bracketEntries.sortOrder), asc(bracketEntries.id));
    return ok({ entries: rows });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/bracket-entries — admin creates a bracket entry. */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body  = await req.json();
    const label = String(body.label || '').trim();
    const teams = Array.isArray(body.teams)
      ? body.teams.map((t: unknown) => String(t).trim()).filter(Boolean)
      : [];
    const sortOrder = Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;

    if (!label)             return fail('Label is required.');
    if (teams.length < 2)   return fail('At least 2 teams are required.');

    const [row] = await db.insert(bracketEntries).values({
      label, teams, sortOrder,
    }).returning();
    return ok({ entry: row }, 201);
  } catch (err) {
    return handleError(err);
  }
}
