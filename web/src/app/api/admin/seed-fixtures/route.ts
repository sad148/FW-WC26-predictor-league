import { db } from '@/db/client';
import { fixtures, audit } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

const SAMPLE: (typeof fixtures.$inferInsert)[] = [
  { date: 'Jun 11', phase: 'group',    groupName: 'A',   teamA: 'Mexico',      teamB: 'USA',      flagA: '🇲🇽', flagB: '🇺🇸', venue: 'AT&T Stadium, Dallas',          status: 'upcoming' },
  { date: 'Jun 12', phase: 'group',    groupName: 'A',   teamA: 'Canada',      teamB: 'Brazil',   flagA: '🇨🇦', flagB: '🇧🇷', venue: 'MetLife Stadium, NJ',           status: 'upcoming' },
  { date: 'Jun 13', phase: 'group',    groupName: 'B',   teamA: 'England',     teamB: 'France',   flagA: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', flagB: '🇫🇷', venue: 'SoFi Stadium, LA',              status: 'upcoming' },
  { date: 'Jun 13', phase: 'group',    groupName: 'B',   teamA: 'Germany',     teamB: 'Japan',    flagA: '🇩🇪', flagB: '🇯🇵', venue: "Levi's Stadium, SF",            status: 'upcoming' },
  { date: 'Jun 14', phase: 'group',    groupName: 'C',   teamA: 'Argentina',   teamB: 'Chile',    flagA: '🇦🇷', flagB: '🇨🇱', venue: 'Rose Bowl, LA',                 status: 'upcoming' },
  { date: 'Jun 14', phase: 'group',    groupName: 'C',   teamA: 'Spain',       teamB: 'Portugal', flagA: '🇪🇸', flagB: '🇵🇹', venue: 'NRG Stadium, Houston',          status: 'upcoming' },
  { date: 'Jun 28', phase: 'knockout', groupName: 'R16', teamA: 'Netherlands', teamB: 'Senegal',  flagA: '🇳🇱', flagB: '🇸🇳', venue: 'Lincoln Financial, Philly',     status: 'upcoming' },
  { date: 'Jun 29', phase: 'knockout', groupName: 'R16', teamA: 'Italy',       teamB: 'Uruguay',  flagA: '🇮🇹', flagB: '🇺🇾', venue: 'Gillette Stadium, Boston',      status: 'upcoming' },
];

/** POST /api/admin/seed-fixtures — bulk-insert 8 sample WC2026 fixtures. Fails if fixtures table already has rows. */
export async function POST() {
  try {
    await requireAdmin();
    const existing = await db.select({ id: fixtures.id }).from(fixtures).limit(1);
    if (existing.length > 0) return fail('Fixtures table already has data. Reset first.', 409);

    const rows = await db.insert(fixtures).values(SAMPLE).returning();
    await db.insert(audit).values({ action: 'seedFixtures', detail: { count: rows.length } });
    return ok({ message: `Seeded ${rows.length} fixtures.`, count: rows.length }, 201);
  } catch (err) {
    return handleError(err);
  }
}
