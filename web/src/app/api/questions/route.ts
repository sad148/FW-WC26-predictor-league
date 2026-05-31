import { NextRequest } from 'next/server';
import { asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { questions, audit } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

/** GET /api/questions — list all questions. Open to anyone. */
export async function GET() {
  try {
    const rows = await db.select().from(questions).orderBy(asc(questions.phase), asc(questions.id));
    return ok({ questions: rows });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/questions — admin creates a question. */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body  = await req.json();
    const text  = String(body.text || '').trim();
    const phase = Number(body.phase);
    const points = Number(body.pointValue);
    const opts  = Array.isArray(body.options) && body.options.length > 0
      ? body.options.map((o: unknown) => String(o)).filter(Boolean)
      : null;

    if (!text)                            return fail('Question text is required.');
    if (phase !== 1 && phase !== 2)       return fail('Phase must be 1 (group) or 2 (knockout).');
    if (!Number.isInteger(points) || points < 1) return fail('Point value must be a positive integer.');

    const [row] = await db.insert(questions).values({
      text, phase, options: opts, pointValue: points,
    }).returning();
    await db.insert(audit).values({ action: 'addQuestion', detail: { id: row.id, phase, points } });
    return ok({ question: row }, 201);
  } catch (err) {
    return handleError(err);
  }
}
