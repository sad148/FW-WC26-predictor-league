import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { groupEntries, groupPicks } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

const PTS_PER_CORRECT_POSITION = 1;

/**
 * PATCH /api/group-entries/[id] — admin settles a group with the correct final ranking.
 * Body: { correctRanking: string }  (pipe-separated 1st→4th: "Brazil|Mexico|Serbia|Argentina")
 * Scores all group_picks for this group: 1 pt per team in the exact correct position.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const gid = parseInt(id, 10);
    if (isNaN(gid)) return fail('Invalid group id.');

    const body          = await req.json();
    const correctRanking = String(body.correctRanking || '').trim();
    if (!correctRanking) return fail('correctRanking is required.');

    const correct = correctRanking.split('|').map(t => t.trim().toLowerCase());
    if (correct.length !== 4) return fail('correctRanking must have exactly 4 pipe-separated teams.');

    const [group] = await db
      .update(groupEntries)
      .set({ correctRanking, status: 'settled' })
      .where(eq(groupEntries.id, gid))
      .returning();
    if (!group) return fail('Group not found.', 404);

    const picks = await db.select().from(groupPicks).where(eq(groupPicks.groupId, gid));
    for (const p of picks) {
      const ranked = p.ranking.split('|').map(t => t.trim().toLowerCase());
      let pts = 0;
      for (let i = 0; i < 4; i++) {
        if (ranked[i] === correct[i]) pts += PTS_PER_CORRECT_POSITION;
      }
      await db.update(groupPicks).set({ pointsAwarded: pts }).where(eq(groupPicks.id, p.id));
    }

    return ok({ group, scored: picks.length });
  } catch (err) {
    return handleError(err);
  }
}
