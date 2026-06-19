import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { bracketRoundWindows } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

/** GET /api/bracket-round-windows — list all round windows. Open to anyone. */
export async function GET() {
  try {
    const rows = await db.select().from(bracketRoundWindows);
    return ok({ windows: rows });
  } catch (err) {
    return handleError(err);
  }
}

/** PUT /api/bracket-round-windows — admin upserts a round window. */
export async function PUT(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const round = String(body.round || '').trim();
    if (!round) return fail('Round is required.');

    const startTime = body.startTime ? new Date(body.startTime) : null;
    const endTime   = body.endTime   ? new Date(body.endTime)   : null;

    const [row] = await db
      .insert(bracketRoundWindows)
      .values({ round, startTime, endTime })
      .onConflictDoUpdate({
        target: bracketRoundWindows.round,
        set: { startTime, endTime },
      })
      .returning();

    return ok({ window: row });
  } catch (err) {
    return handleError(err);
  }
}
