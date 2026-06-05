import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { requireAdmin } from '@/lib/session';
import { ok, handleError } from '@/lib/responses';

/** POST /api/admin/reset — clears round-specific data only. Preserves users, leagues, and fixtures. */
export async function POST() {
  try {
    await requireAdmin();
    await db.execute(sql`TRUNCATE TABLE bets, question_answers, group_picks, bracket_picks, bailouts RESTART IDENTITY CASCADE`);
    return ok({ message: 'Player submissions cleared. Questions, brackets, phases, and fixtures intact.' });
  } catch (err) {
    return handleError(err);
  }
}
