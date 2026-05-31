import { NextRequest } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { questionAnswers, questions, questionPhases, audit } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { HttpError } from '@/lib/errors';
import { ok, fail, handleError } from '@/lib/responses';

/** GET /api/answers — list current user's trivia answers. */
export async function GET() {
  try {
    const session = await requireUser();
    const rows = await db.select().from(questionAnswers)
      .where(eq(questionAnswers.userId, session.userId!))
      .orderBy(asc(questionAnswers.createdAt));
    return ok({ answers: rows });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/answers — submit or replace an answer to a question.
 * Allowed only while the question's phase window is open (and it isn't settled).
 * UNIQUE(user, question) enforces one row.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();
    if (session.isAdmin) {
      throw new HttpError(403, 'Admin accounts cannot answer trivia. Use a player account.');
    }
    const body = await req.json();
    const qid    = parseInt(String(body.questionId), 10);
    const answer = String(body.answer || '').trim();
    if (isNaN(qid)) return fail('questionId is required.');
    if (!answer)    return fail('Answer cannot be empty.');

    const [q] = await db.select().from(questions).where(eq(questions.id, qid));
    if (!q)                        return fail('Question not found.', 404);
    if (q.status === 'settled')    return fail('This question has already been settled.', 409);

    // Answering is gated by the phase-level window (a single window per phase), not per question.
    const [window] = await db.select().from(questionPhases).where(eq(questionPhases.phase, q.phase));
    const now = new Date();
    if (!window || !window.startTime || !window.endTime) {
      return fail('This phase is not open for answers yet.', 409);
    }
    if (now < window.startTime) return fail('This phase hasn\'t opened for answers yet.', 409);
    if (now >= window.endTime)  return fail('This phase is closed for answers.', 409);

    // If options are defined, the answer must be one of them.
    if (q.options && !q.options.includes(answer)) {
      return fail('Answer must be one of the provided options.');
    }

    // Upsert: ON CONFLICT (user_id, question_id) DO UPDATE answer
    const [row] = await db.insert(questionAnswers).values({
      userId:     session.userId!,
      questionId: qid,
      answer,
    }).onConflictDoUpdate({
      target: [questionAnswers.userId, questionAnswers.questionId],
      set:    { answer, outcome: 'pending', pointsAwarded: 0 },
    }).returning();

    await db.insert(audit).values({
      action: 'saveAnswer',
      detail: { userId: session.userId, questionId: qid, answer },
    });
    return ok({ answer: row }, 201);
  } catch (err) {
    return handleError(err);
  }
}

