import { NextRequest } from 'next/server';
import { db } from '@/db/client';
import { groupEntries } from '@/db/schema';
import { requireAdmin } from '@/lib/session';
import { ok, fail, handleError } from '@/lib/responses';

/**
 * POST /api/group-entries/bulk — admin imports multiple groups at once.
 * Body: { groups: { groupName: string, teams: string }[] }
 * teams is pipe-separated: "Brazil|Argentina|Mexico|Serbia"
 * Validates all rows first; inserts all or nothing.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    if (!Array.isArray(body.groups) || body.groups.length === 0) {
      return fail('groups array is required.');
    }

    const rows: { groupName: string; teams: string }[] = [];
    for (const [i, g] of body.groups.entries()) {
      const groupName = String(g.groupName || '').trim().toUpperCase();
      const teams     = String(g.teams || '').trim();
      if (!groupName) return fail(`Row ${i + 1}: groupName is required.`);
      if (teams.split('|').filter(Boolean).length < 2) {
        return fail(`Row ${i + 1} (${groupName}): at least 2 pipe-separated teams required.`);
      }
      rows.push({ groupName, teams });
    }

    const inserted = await db.insert(groupEntries).values(rows).returning();
    return ok({ count: inserted.length }, 201);
  } catch (err) {
    return handleError(err);
  }
}
