import { NextRequest } from 'next/server';
import { asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { bracketPhases } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

const PHASES = [1, 2] as const;

/**
 * GET /api/bracket-phases — submission window for each bracket phase. Open to anyone.
 * Always returns both phases; a phase with no row yet has null start/end times.
 */
export async function GET() {
  try {
    const rows = await db.select().from(bracketPhases).orderBy(asc(bracketPhases.phase));
    const byPhase = new Map(rows.map(r => [r.phase, r]));
    const phases = PHASES.map(phase => {
      const r = byPhase.get(phase);
      return {
        phase,
        startTime: r?.startTime ?? null,
        endTime:   r?.endTime   ?? null,
      };
    });
    return ok({ phases });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * PUT /api/bracket-phases — admin sets one phase's submission window. Upsert keyed on phase.
 * Empty/missing times clear the window (no picks accepted until window is set again).
 */
export async function PUT(req: NextRequest) {
  try {
    await requireAdmin();
    const body  = await req.json();
    const phase = Number(body.phase);
    if (phase !== 1 && phase !== 2) return fail('Phase must be 1 (group) or 2 (knockout).');

    const startTime = body.startTime ? new Date(String(body.startTime)) : null;
    const endTime   = body.endTime   ? new Date(String(body.endTime))   : null;
    if (startTime && endTime && startTime >= endTime) {
      return fail('Close time must be after open time.');
    }

    const [row] = await db
      .insert(bracketPhases)
      .values({ phase, startTime, endTime })
      .onConflictDoUpdate({ target: bracketPhases.phase, set: { startTime, endTime } })
      .returning();

    return ok({ phase: row });
  } catch (err) {
    return handleError(err);
  }
}
