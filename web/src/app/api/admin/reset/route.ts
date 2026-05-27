import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { audit } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, handleError } from '@/lib/responses';

/**
 * POST /api/admin/reset — testing-phase nuke: truncate every table.
 * Mirrors the Apps Script resetData. Run only when you want to start clean.
 */
export async function POST() {
  try {
    await requireAdmin();
    await db.execute(sql`TRUNCATE TABLE bets, fixtures, leagues, users, audit RESTART IDENTITY CASCADE`);
    await db.insert(audit).values({
      action: 'resetData',
      detail: { tables: ['bets', 'fixtures', 'leagues', 'users', 'audit'] },
    });
    return ok({ message: 'All tables truncated.' });
  } catch (err) {
    return handleError(err);
  }
}
