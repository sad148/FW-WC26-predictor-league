import { NextRequest } from 'next/server';
import { asc, max } from 'drizzle-orm';
import { db } from '@/db/client';
import { questionPhases } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

/**
 * GET /api/question-phases — all phases with their answer windows. Open to anyone.
 */
export async function GET() {
  try {
    const rows = await db.select().from(questionPhases).orderBy(asc(questionPhases.phase));
    const phases = rows.map(r => ({
      phase:     r.phase,
      name:      r.name,
      startTime: r.startTime ?? null,
      endTime:   r.endTime   ?? null,
    }));
    return ok({ phases });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/question-phases — admin creates a new phase with a name. Auto-assigns next integer.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const name = String(body.name ?? '').trim();
    if (!name) return fail('Phase name is required.');

    const [{ maxPhase }] = await db.select({ maxPhase: max(questionPhases.phase) }).from(questionPhases);
    const nextPhase = (maxPhase ?? 0) + 1;

    const [row] = await db
      .insert(questionPhases)
      .values({ phase: nextPhase, name, startTime: null, endTime: null })
      .returning();

    return ok({ phase: row });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * PUT /api/question-phases — admin sets one phase's window and/or name. Upsert keyed on phase.
 */
export async function PUT(req: NextRequest) {
  try {
    await requireAdmin();
    const body  = await req.json();
    const phase = Number(body.phase);
    if (!Number.isInteger(phase) || phase < 1) return fail('Invalid phase.');

    const name      = body.name !== undefined ? String(body.name).trim() : undefined;
    const startTime = body.startTime ? new Date(String(body.startTime)) : null;
    const endTime   = body.endTime   ? new Date(String(body.endTime))   : null;
    if (startTime && endTime && startTime >= endTime) {
      return fail('Close time must be after open time.');
    }

    const set: Partial<typeof questionPhases.$inferInsert> = { startTime, endTime };
    if (name !== undefined) set.name = name;

    const [row] = await db
      .insert(questionPhases)
      .values({ phase, name: name ?? '', startTime, endTime })
      .onConflictDoUpdate({ target: questionPhases.phase, set })
      .returning();

    return ok({ phase: row });
  } catch (err) {
    return handleError(err);
  }
}
