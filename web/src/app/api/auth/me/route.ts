import { getSession } from '@/lib/session';
import { ok, handleError } from '@/lib/responses';

export async function GET() {
  try {
    const session = await getSession();
    if (!session.userId) return ok({ user: null, isAdmin: !!session.isAdmin });
    return ok({
      user:    { userId: session.userId, playerId: session.playerId, name: session.name },
      isAdmin: !!session.isAdmin,
    });
  } catch (err) {
    return handleError(err);
  }
}
