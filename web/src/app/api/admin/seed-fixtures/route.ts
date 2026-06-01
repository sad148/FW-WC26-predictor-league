import { db } from '@/db/client';
import { fixtures } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

// Seeded matches all open 1 hour from now and close 24 hours later — gives the admin
// time to demo bet placement against a live window without manually setting times.
const NOW       = Date.now();
const OPEN_AT   = new Date(NOW + 60 * 60 * 1000);
const CLOSE_AT  = new Date(NOW + 25 * 60 * 60 * 1000);

const SAMPLE: (typeof fixtures.$inferInsert)[] = [
  { date: 'Jun 11', phase: 'group',    groupName: 'A',   teamA: 'Mexico',      teamB: 'USA',      startTime: OPEN_AT, endTime: CLOSE_AT },
  { date: 'Jun 12', phase: 'group',    groupName: 'A',   teamA: 'Canada',      teamB: 'Brazil',   startTime: OPEN_AT, endTime: CLOSE_AT },
  { date: 'Jun 13', phase: 'group',    groupName: 'B',   teamA: 'England',     teamB: 'France',   startTime: OPEN_AT, endTime: CLOSE_AT },
  { date: 'Jun 13', phase: 'group',    groupName: 'B',   teamA: 'Germany',     teamB: 'Japan',    startTime: OPEN_AT, endTime: CLOSE_AT },
  { date: 'Jun 14', phase: 'group',    groupName: 'C',   teamA: 'Argentina',   teamB: 'Chile',    startTime: OPEN_AT, endTime: CLOSE_AT },
  { date: 'Jun 14', phase: 'group',    groupName: 'C',   teamA: 'Spain',       teamB: 'Portugal', startTime: OPEN_AT, endTime: CLOSE_AT },
  { date: 'Jun 28', phase: 'knockout', groupName: 'R16', teamA: 'Netherlands', teamB: 'Senegal',  startTime: OPEN_AT, endTime: CLOSE_AT },
  { date: 'Jun 29', phase: 'knockout', groupName: 'R16', teamA: 'Italy',       teamB: 'Uruguay',  startTime: OPEN_AT, endTime: CLOSE_AT },
];

/** POST /api/admin/seed-fixtures — bulk-insert 8 sample WC2026 fixtures. Fails if fixtures table already has rows. */
export async function POST() {
  try {
    await requireAdmin();
    const existing = await db.select({ id: fixtures.id }).from(fixtures).limit(1);
    if (existing.length > 0) return fail('Fixtures table already has data. Reset first.', 409);

    const rows = await db.insert(fixtures).values(SAMPLE).returning();
    return ok({ message: `Seeded ${rows.length} fixtures.`, count: rows.length }, 201);
  } catch (err) {
    return handleError(err);
  }
}
