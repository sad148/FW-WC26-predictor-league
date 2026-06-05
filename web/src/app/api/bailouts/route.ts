import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { bailouts } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { HttpError } from '@/lib/errors';
import { ok, fail, handleError } from '@/lib/responses';

/** POST /api/bailouts — trade 10 trivia/bracket pts for 100 coins. Only at wallet ≤ 0 with ≥ 10 pts remaining. */
export async function POST() {
  try {
    const session = await requireUser();
    if (session.isAdmin) throw new HttpError(403, 'Admin accounts cannot use bailout.');

    const result = await db.execute<{ coins: number; availablePts: number }>(sql`
      SELECT
        (
          100
          + COALESCE((
              SELECT SUM(-wager + CASE WHEN outcome != 'pending' THEN points_awarded ELSE 0 END)
              FROM bets WHERE user_id = ${session.userId}
            ), 0)
          + COALESCE((SELECT SUM(coins_awarded) FROM bailouts WHERE user_id = ${session.userId}), 0)
        )::int AS coins,
        (
          COALESCE((SELECT SUM(points_awarded) FROM question_answers WHERE user_id = ${session.userId} AND outcome = 'win'), 0)
          + COALESCE((SELECT SUM(points_awarded) FROM bracket_picks   WHERE user_id = ${session.userId} AND outcome = 'win'), 0)
          + COALESCE((SELECT SUM(points_awarded) FROM group_picks     WHERE user_id = ${session.userId}), 0)
          - COALESCE((SELECT SUM(points_deducted) FROM bailouts       WHERE user_id = ${session.userId}), 0)
        )::int AS "availablePts"
    `);

    const { coins, availablePts } = result.rows[0] ?? { coins: 100, availablePts: 0 };

    if (coins > 0)          return fail('Bailout is only available when your coins reach 0.');
    if (availablePts < 10)  return fail('You need at least 10 trivia/bracket points to bail out.');

    const [row] = await db.insert(bailouts).values({ userId: session.userId! }).returning();
    return ok({ bailout: row }, 201);
  } catch (err) {
    return handleError(err);
  }
}
