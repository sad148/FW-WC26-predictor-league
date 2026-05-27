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
    const scoreA = body.scoreA === '' || body.scoreA == null ? null : Number(body.scoreA);
    const scoreB = body.scoreB === '' || body.scoreB == null ? null : Number(body.scoreB);
    const status = String(body.status || 'upcoming');

    const updates: { status: string; scoreA?: number; scoreB?: number } = { status };
    if (scoreA !== null && !isNaN(scoreA)) updates.scoreA = scoreA;
    if (scoreB !== null && !isNaN(scoreB)) updates.scoreB = scoreB;

    const [row] = await db.update(fixtures).set(updates).where(eq(fixtures.id, matchId)).returning();
    if (!row) return fail('Match not found.', 404);

    let settled = 0;
    if (status === 'complete' && scoreA !== null && scoreB !== null && !isNaN(scoreA) && !isNaN(scoreB)) {
      settled = await settlePendingBets(matchId, scoreA, scoreB);
    }

    await db.insert(audit).values({
      action: 'saveResult',
      detail: { matchId, scoreA, scoreB, status, settled },
    });
    return ok({ match: row, settled });
  } catch (err) {
    return handleError(err);
  }
}
