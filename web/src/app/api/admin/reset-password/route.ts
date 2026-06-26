import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { hashPassword } from '@/lib/auth';
import { requireAdmin } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

/** POST /api/admin/reset-password — set a new password for any user. */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body        = await req.json();
    const userId      = Number(body.userId);
    const newPassword = String(body.newPassword || '').trim();

    if (!userId)               return fail('userId is required.');
    if (newPassword.length < 4) return fail('Password must be at least 4 characters.');

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!user) return fail('User not found.', 404);

    const passwordHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

    return ok({ message: 'Password updated.' });
  } catch (err) {
    return handleError(err);
  }
}
