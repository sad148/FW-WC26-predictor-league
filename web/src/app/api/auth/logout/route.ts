import { getSession } from '@/lib/session';
import { ok, handleError } from '@/lib/responses';

export async function POST() {
  try {
    const session = await getSession();
    session.destroy();
    return ok();
  } catch (err) {
    return handleError(err);
  }
}
