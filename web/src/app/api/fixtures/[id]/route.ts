import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { fixtures, audit } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { settlePendingBets } from '@/lib/settle';
import { ok, fail, handleError } from '@/lib/responses';

/**
 * PATCH /api/fixtures/[id] — update score/status. Admin only.
 * If status flips to 'complete' with both scores set, all pending bets settle server-side.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const matchId = parseInt(id, 10);
    if (isNaN(matchId)) return fail('Invalid match id.');

    const body = await req.json();
    const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

    const scoreA      = body.scoreA === '' || body.scoreA == null ? null : Number(body.scoreA);
    const scoreB      = body.scoreB === '' || body.scoreB == null ? null : Number(body.scoreB);
    const firstScorer = body.firstScorer === '' || body.firstScorer == null ? null : String(body.firstScorer);
    const totalCards  = body.totalCards  === '' || body.totalCards  == null ? null : Number(body.totalCards);
    const startTime   = body.startTime ? new Date(String(body.startTime)) : null;
    const endTime     = body.endTime   ? new Date(String(body.endTime))   : null;

    const updates: {
      scoreA?:      number | null;
      scoreB?:      number | null;
      firstScorer?: string | null;
      totalCards?:  number | null;
      startTime?:   Date | null;
      endTime?:     Date | null;
    } = {};
    if (has('scoreA'))      updates.scoreA      = scoreA  !== null && !isNaN(scoreA)  ? scoreA  : null;
    if (has('scoreB'))      updates.scoreB      = scoreB  !== null && !isNaN(scoreB)  ? scoreB  : null;
    if (has('firstScorer')) updates.firstScorer = firstScorer;
    if (has('totalCards'))  updates.totalCards  = totalCards !== null && !isNaN(totalCards) ? totalCards : null;
    if (has('startTime'))   updates.startTime   = startTime;
    if (has('endTime'))     updates.endTime     = endTime;

    const [row] = await db.update(fixtures).set(updates).where(eq(fixtures.id, matchId)).returning();
    if (!row) return fail('Match not found.', 404);

    // Settle pending bets whenever both scores are present after this update.
    // settlePendingBets only touches rows still in 'pending', so it's idempotent.
    let settled = 0;
    if (row.scoreA !== null && row.scoreB !== null) {
      settled = await settlePendingBets(matchId, row.scoreA, row.scoreB);
    }

    await db.insert(audit).values({
      action: 'saveResult',
      detail: { matchId, scoreA: row.scoreA, scoreB: row.scoreB, firstScorer: row.firstScorer, totalCards: row.totalCards, startTime: row.startTime, endTime: row.endTime, settled },
    });
    return ok({ match: row, settled });
  } catch (err) {
    return handleError(err);
  }
}
