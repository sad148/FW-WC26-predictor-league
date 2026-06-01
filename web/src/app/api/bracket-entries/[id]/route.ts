import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bracketEntries, bracketPicks } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { ok, fail, handleError } from "@/lib/responses";

const BRACKET_UNIT_VALUE = 3; // PRD §3 C: flat 3 pts per correct pick

/**
 * PATCH /api/bracket-entries/[id] — admin updates a bracket entry.
 * If status flips to 'settled' AND correctPick is set, all pending picks
 * are graded: case-insensitive trim compare → win awards 3 pts.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const eid = parseInt(id, 10);
    if (isNaN(eid)) return fail("Invalid entry id.");

    const body = await req.json();
    const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

    const updates: Partial<typeof bracketEntries.$inferInsert> = {};
    if (has("label")) updates.label = String(body.label);
    if (has("teams"))
      updates.teams = Array.isArray(body.teams)
        ? body.teams.map((t: unknown) => String(t).trim()).filter(Boolean)
        : [];
    if (has("sortOrder")) updates.sortOrder = Number(body.sortOrder);
    if (has("correctPick"))
      updates.correctPick =
        body.correctPick == null || body.correctPick === ""
          ? null
          : String(body.correctPick);
    if (has("status")) updates.status = String(body.status);

    const [row] = await db
      .update(bracketEntries)
      .set(updates)
      .where(eq(bracketEntries.id, eid))
      .returning();
    if (!row) return fail("Bracket entry not found.", 404);

    let settled = 0;
    if (row.status === "settled" && row.correctPick) {
      const expected = row.correctPick.trim().toLowerCase();
      const picks = await db
        .select()
        .from(bracketPicks)
        .where(eq(bracketPicks.entryId, eid));
      for (const p of picks) {
        if (p.outcome !== "pending") continue;
        const correct = p.pick.trim().toLowerCase() === expected;
        await db
          .update(bracketPicks)
          .set({
            outcome: correct ? "win" : "loss",
            pointsAwarded: correct ? BRACKET_UNIT_VALUE : 0,
          })
          .where(eq(bracketPicks.id, p.id));
        settled++;
      }
    }

    return ok({ entry: row, settled });
  } catch (err) {
    return handleError(err);
  }
}
