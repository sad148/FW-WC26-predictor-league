import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { questions, questionAnswers } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

const parseOpts  = (raw: string | null) => raw ? raw.split('|') : null;
const serializeOpts = (v: unknown) =>
  Array.isArray(v) && v.length > 0 ? v.map(String).filter(Boolean).join('|') : null;
const VALID_TYPES = ['option-buttons', 'free-text', 'comma-teams'];

// For comma-teams: split by comma, trim, lowercase, sort — order-insensitive comparison.
const normalizeCommaTeams = (s: string) =>
  s.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).sort().join(',');

/**
 * PATCH /api/questions/[id] — admin updates a question.
 * If status flips to 'settled' AND winningAnswer is set, all pending answers
 * are scored. comma-teams questions use order-insensitive set comparison.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const qid = parseInt(id, 10);
    if (isNaN(qid)) return fail('Invalid question id.');

    const body = await req.json();
    const has  = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

    const updates: Partial<typeof questions.$inferInsert> = {};
    if (has('text'))           updates.text          = String(body.text);
    if (has('phase'))          updates.phase         = Number(body.phase);
    if (has('pointValue'))     updates.pointValue    = Number(body.pointValue);
    if (has('options'))        updates.options       = serializeOpts(body.options);
    if (has('questionType'))   updates.questionType  = VALID_TYPES.includes(body.questionType)
                                                        ? String(body.questionType) : 'option-buttons';
    if (has('maxSelections'))  updates.maxSelections = body.maxSelections != null && Number(body.maxSelections) > 1
                                                        ? Number(body.maxSelections) : null;
    if (has('winningAnswer'))  updates.winningAnswer = body.winningAnswer == null || body.winningAnswer === ''
                                                        ? null : String(body.winningAnswer);
    if (has('status'))         updates.status        = String(body.status);

    const [row] = await db.update(questions).set(updates).where(eq(questions.id, qid)).returning();
    if (!row) return fail('Question not found.', 404);

    let settled = 0;
    if (row.status === 'settled' && row.winningAnswer) {
      const isCommaTeams = row.questionType === 'comma-teams';
      const expected = isCommaTeams
        ? normalizeCommaTeams(row.winningAnswer)
        : row.winningAnswer.trim().toLowerCase();

      const all = await db.select().from(questionAnswers).where(eq(questionAnswers.questionId, qid));
      for (const a of all) {
        const actual  = isCommaTeams
          ? normalizeCommaTeams(a.answer)
          : a.answer.trim().toLowerCase();
        const correct = actual === expected;
        await db.update(questionAnswers).set({
          outcome:       correct ? 'win' : 'loss',
          pointsAwarded: correct ? row.pointValue : 0,
        }).where(eq(questionAnswers.id, a.id));
        settled++;
      }
    }

    return ok({ question: { ...row, options: parseOpts(row.options) }, settled });
  } catch (err) {
    return handleError(err);
  }
}
