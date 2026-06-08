import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { requireAdmin } from '@/lib/session';
import { ok, handleError } from '@/lib/responses';

/** GET /api/admin/leagues — all leagues with member counts. */
export async function GET() {
  try {
    await requireAdmin();
    const rows = await db.execute<{
      id:          number;
      name:        string;
      code:        string;
      createdAt:   string;
      memberCount: number;
    }>(sql`
      SELECT
        l.id,
        l.name,
        l.code,
        l.created_at AS "createdAt",
        COUNT(lm.user_id)::int AS "memberCount"
      FROM leagues l
      LEFT JOIN league_members lm ON lm.league_id = l.id
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `);
    return ok({ leagues: rows.rows });
  } catch (err) {
    return handleError(err);
  }
}
