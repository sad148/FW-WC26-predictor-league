import { db } from '@/db/client';
import { fixtures } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

// All group-stage betting opens at 12:00 AM ET June 6 = 04:00 UTC June 6.
// Close times converted from ET (EDT = UTC−4) to UTC.
const OPEN = new Date('2026-06-06T04:00:00Z');

type F = typeof fixtures.$inferInsert;
const f = (teamA: string, teamB: string, group: string, closeIso: string): F => ({
  phase: 'group',
  groupName: group,
  teamA,
  teamB,
  startTime: OPEN,
  endTime: new Date(closeIso),
});

const FIXTURES: F[] = [
  // ── Group A ──────────────────────────────────────────────────────────
  f('Mexico',                   'South Africa',           'A', '2026-06-11T19:00:00Z'),
  f('South Korea',              'Czechia',                'A', '2026-06-12T02:00:00Z'),
  f('Czechia',                  'South Africa',           'A', '2026-06-18T16:00:00Z'),
  f('Mexico',                   'South Korea',            'A', '2026-06-19T01:00:00Z'),
  f('South Africa',             'South Korea',            'A', '2026-06-24T20:00:00Z'),
  f('Czechia',                  'Mexico',                 'A', '2026-06-24T20:00:00Z'),

  // ── Group B ──────────────────────────────────────────────────────────
  f('Canada',                   'Bosnia and Herzegovina', 'B', '2026-06-12T19:00:00Z'),
  f('Qatar',                    'Switzerland',            'B', '2026-06-13T19:00:00Z'),
  f('Switzerland',              'Bosnia and Herzegovina', 'B', '2026-06-18T19:00:00Z'),
  f('Canada',                   'Qatar',                  'B', '2026-06-18T22:00:00Z'),
  f('Bosnia and Herzegovina',   'Qatar',                  'B', '2026-06-25T01:00:00Z'),
  f('Switzerland',              'Canada',                 'B', '2026-06-25T01:00:00Z'),

  // ── Group C ──────────────────────────────────────────────────────────
  f('Brazil',                   'Morocco',                'C', '2026-06-13T22:00:00Z'),
  f('Haiti',                    'Scotland',               'C', '2026-06-14T01:00:00Z'),
  f('Scotland',                 'Morocco',                'C', '2026-06-19T22:00:00Z'),
  f('Brazil',                   'Haiti',                  'C', '2026-06-20T01:00:00Z'),
  f('Morocco',                  'Haiti',                  'C', '2026-06-25T18:00:00Z'),
  f('Scotland',                 'Brazil',                 'C', '2026-06-25T18:00:00Z'),

  // ── Group D ──────────────────────────────────────────────────────────
  f('United States',            'Paraguay',               'D', '2026-06-13T01:00:00Z'),
  f('Australia',                'Turkey',                 'D', '2026-06-13T04:00:00Z'),
  f('United States',            'Australia',              'D', '2026-06-19T19:00:00Z'),
  f('Turkey',                   'Paraguay',               'D', '2026-06-20T03:00:00Z'),
  f('Paraguay',                 'Australia',              'D', '2026-06-25T23:00:00Z'),
  f('Turkey',                   'United States',          'D', '2026-06-25T23:00:00Z'),

  // ── Group E ──────────────────────────────────────────────────────────
  f('Germany',                  'Curacao',                'E', '2026-06-14T17:00:00Z'),
  f('Ivory Coast',              'Ecuador',                'E', '2026-06-14T23:00:00Z'),
  f('Germany',                  'Ivory Coast',            'E', '2026-06-20T20:00:00Z'),
  f('Ecuador',                  'Curacao',                'E', '2026-06-20T23:00:00Z'),
  f('Curacao',                  'Ivory Coast',            'E', '2026-06-26T19:00:00Z'),
  f('Ecuador',                  'Germany',                'E', '2026-06-26T19:00:00Z'),

  // ── Group F ──────────────────────────────────────────────────────────
  f('Netherlands',              'Japan',                  'F', '2026-06-14T20:00:00Z'),
  f('Sweden',                   'Tunisia',                'F', '2026-06-15T02:00:00Z'),
  f('Netherlands',              'Sweden',                 'F', '2026-06-20T16:00:00Z'),
  f('Tunisia',                  'Japan',                  'F', '2026-06-21T02:00:00Z'),
  f('Japan',                    'Sweden',                 'F', '2026-06-27T00:00:00Z'),
  f('Tunisia',                  'Netherlands',            'F', '2026-06-27T00:00:00Z'),

  // ── Group G ──────────────────────────────────────────────────────────
  f('Belgium',                  'Egypt',                  'G', '2026-06-15T19:00:00Z'),
  f('Iran',                     'New Zealand',            'G', '2026-06-16T01:00:00Z'),
  f('Belgium',                  'Iran',                   'G', '2026-06-21T19:00:00Z'),
  f('New Zealand',              'Egypt',                  'G', '2026-06-22T01:00:00Z'),
  f('Egypt',                    'Iran',                   'G', '2026-06-27T16:00:00Z'),
  f('New Zealand',              'Belgium',                'G', '2026-06-27T16:00:00Z'),

  // ── Group H ──────────────────────────────────────────────────────────
  f('Spain',                    'Cabo Verde',             'H', '2026-06-15T16:00:00Z'),
  f('Saudi Arabia',             'Uruguay',                'H', '2026-06-15T22:00:00Z'),
  f('Spain',                    'Saudi Arabia',           'H', '2026-06-21T16:00:00Z'),
  f('Uruguay',                  'Cabo Verde',             'H', '2026-06-21T22:00:00Z'),
  f('Cabo Verde',               'Saudi Arabia',           'H', '2026-06-27T20:00:00Z'),
  f('Uruguay',                  'Spain',                  'H', '2026-06-27T20:00:00Z'),

  // ── Group I ──────────────────────────────────────────────────────────
  f('France',                   'Senegal',                'I', '2026-06-16T19:00:00Z'),
  f('Iraq',                     'Norway',                 'I', '2026-06-16T22:00:00Z'),
  f('France',                   'Iraq',                   'I', '2026-06-22T21:00:00Z'),
  f('Norway',                   'Senegal',                'I', '2026-06-23T00:00:00Z'),
  f('Senegal',                  'Iraq',                   'I', '2026-06-27T23:00:00Z'),
  f('Norway',                   'France',                 'I', '2026-06-27T23:00:00Z'),

  // ── Group J ──────────────────────────────────────────────────────────
  f('Austria',                  'Jordan',                 'J', '2026-06-16T04:00:00Z'),
  f('Argentina',                'Algeria',                'J', '2026-06-17T01:00:00Z'),
  f('Argentina',                'Austria',                'J', '2026-06-22T17:00:00Z'),
  f('Jordan',                   'Algeria',                'J', '2026-06-23T03:00:00Z'),
  f('Algeria',                  'Austria',                'J', '2026-06-28T02:00:00Z'),
  f('Jordan',                   'Argentina',              'J', '2026-06-28T02:00:00Z'),

  // ── Group K ──────────────────────────────────────────────────────────
  f('Portugal',                 'DR Congo',               'K', '2026-06-17T17:00:00Z'),
  f('Uzbekistan',               'Colombia',               'K', '2026-06-18T02:00:00Z'),
  f('Portugal',                 'Uzbekistan',             'K', '2026-06-23T17:00:00Z'),
  f('Colombia',                 'DR Congo',               'K', '2026-06-24T02:00:00Z'),
  f('DR Congo',                 'Uzbekistan',             'K', '2026-06-27T21:00:00Z'),
  f('Colombia',                 'Portugal',               'K', '2026-06-27T21:00:00Z'),

  // ── Group L ──────────────────────────────────────────────────────────
  f('England',                  'Croatia',                'L', '2026-06-17T20:00:00Z'),
  f('Ghana',                    'Panama',                 'L', '2026-06-17T23:00:00Z'),
  f('England',                  'Ghana',                  'L', '2026-06-23T20:00:00Z'),
  f('Panama',                   'Croatia',                'L', '2026-06-23T23:00:00Z'),
  f('Croatia',                  'Ghana',                  'L', '2026-06-28T00:00:00Z'),
  f('Panama',                   'England',                'L', '2026-06-28T00:00:00Z'),
];

/** POST /api/admin/seed-fixtures — bulk-insert all 72 WC2026 group-stage fixtures. Fails if fixtures table already has rows. */
export async function POST() {
  try {
    await requireAdmin();
    const existing = await db.select({ id: fixtures.id }).from(fixtures).limit(1);
    if (existing.length > 0) return fail('Fixtures table already has data. Reset first.', 409);

    const rows = await db.insert(fixtures).values(FIXTURES).returning();
    return ok({ message: `Seeded ${rows.length} fixtures.`, count: rows.length }, 201);
  } catch (err) {
    return handleError(err);
  }
}
