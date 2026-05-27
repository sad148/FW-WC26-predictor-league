import { getSession } from '@/lib/session';
import { ok, handleError } from '@/lib/responses';

export async function POST() {
  try {
    const session = await getSession();
    session.isAdmin = false;
    await session.save();
    return ok();
  } catch (err) {
    return handleError(err);
  }
}
