import { NextRequest } from 'next/server';
import { asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { questions } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

const parseOpts = (raw: string | null) => raw ? raw.split('|') : null;
const serializeOpts = (v: unknown) =>
  Array.isArray(v) && v.length > 0 ? v.map(String).filter(Boolean).join('|') : null;

/** GET /api/questions — list all questions. Open to anyone. */
export async function GET() {
  try {
    const rows = await db.select().from(questions).orderBy(asc(questions.phase), asc(questions.id));
    return ok({ questions: rows.map(q => ({ ...q, options: parseOpts(q.options) })) });
  } catch (err) {
    return handleError(err);
  }
}

const VALID_TYPES = ['option-buttons', 'free-text', 'comma-teams'];

/** POST /api/questions — admin creates a question. */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body          = await req.json();
    const text          = String(body.text || '').trim();
    const phase         = Number(body.phase);
    const points        = Number(body.pointValue);
    const opts          = serializeOpts(body.options);
    const questionType  = VALID_TYPES.includes(body.questionType) ? String(body.questionType) : 'option-buttons';
    const maxSelections = body.maxSelections != null && Number(body.maxSelections) > 1
      ? Number(body.maxSelections) : null;

    if (!text)                                    return fail('Question text is required.');
    if (phase !== 1 && phase !== 2)               return fail('Phase must be 1 (group) or 2 (knockout).');
    if (!Number.isInteger(points) || points < 1)  return fail('Point value must be a positive integer.');

    const [row] = await db.insert(questions).values({
      text, phase, options: opts, questionType, maxSelections, pointValue: points,
    }).returning();
    return ok({ question: { ...row, options: parseOpts(row.options) } }, 201);
  } catch (err) {
    return handleError(err);
  }
}
