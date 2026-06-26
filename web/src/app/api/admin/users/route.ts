import { db } from '@/db/client';
import { users } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, handleError } from '@/lib/responses';
import { asc } from 'drizzle-orm';

/** GET /api/admin/users — all users (id + name) for admin password reset. */
export async function GET() {
  try {
    await requireAdmin();
    const rows = await db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name));
    return ok({ users: rows });
  } catch (err) {
    return handleError(err);
  }
}
