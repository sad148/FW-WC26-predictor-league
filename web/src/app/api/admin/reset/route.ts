import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { requireAdmin } from '@/lib/session';
import { ok, handleError } from '@/lib/responses';

/** POST /api/admin/reset — clears round-specific data only. Preserves users, leagues, and fixtures. */
export async function POST() {
  try {
    await requireAdmin();
    await db.execute(sql`TRUNCATE TABLE bracket_picks, bracket_phases, bracket_entries, question_answers, question_phases, questions, bets RESTART IDENTITY CASCADE`);
    return ok({ message: 'Bets, trivia, and bracket data cleared.' });
  } catch (err) {
    return handleError(err);
  }
}
