import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bracketEntries, bracketPicks } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { ok, fail, handleError } from "@/lib/responses";

const BRACKET_UNIT_VALUE = 3;

const NEXT_ROUND: Record<string, string> = {
  r32: "r16",
  r16: "qf",
  qf: "sf",
  sf: "final",
};

/**
 * PATCH /api/bracket-entries/[id] — admin updates a bracket entry.
 * On settlement: scores all pending picks, then auto-progresses the winner
 * into the next round's entry (if the sibling entry is also settled).
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
    if (has("round")) updates.round = String(body.round);
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

    // ── Score picks ────────────────────────────────────────────────────
    let settled = 0;
    if (row.status === "settled" && row.correctPick) {
      const expected = row.correctPick.trim().toLowerCase();
      const picks = await db
        .select()
        .from(bracketPicks)
        .where(eq(bracketPicks.entryId, eid));
      for (const p of picks) {
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

    // ── Auto-progression ───────────────────────────────────────────────
    // If this entry is now settled and has a next round, find its sibling.
    // If the sibling is also settled, push both winners into the next-round entry's teams.
    let progressed = false;
    if (row.status === "settled" && row.correctPick && row.round && NEXT_ROUND[row.round]) {
      const nextRound = NEXT_ROUND[row.round];
      const siblingOrder = row.sortOrder % 2 === 0 ? row.sortOrder + 1 : row.sortOrder - 1;

      const [sibling] = await db
        .select()
        .from(bracketEntries)
        .where(
          and(
            eq(bracketEntries.round, row.round),
            eq(bracketEntries.sortOrder, siblingOrder),
          ),
        );

      if (sibling?.status === "settled" && sibling.correctPick) {
        const nextSortOrder = Math.floor(row.sortOrder / 2);
        const isUpper = row.sortOrder % 2 === 0;
        const teamA = isUpper ? row.correctPick : sibling.correctPick;
        const teamB = isUpper ? sibling.correctPick : row.correctPick;

        const [nextEntry] = await db
          .select()
          .from(bracketEntries)
          .where(
            and(
              eq(bracketEntries.round, nextRound),
              eq(bracketEntries.sortOrder, nextSortOrder),
            ),
          );

        if (nextEntry) {
          await db
            .update(bracketEntries)
            .set({ teams: [teamA, teamB] })
            .where(eq(bracketEntries.id, nextEntry.id));
          progressed = true;
        }
      }
    }

    return ok({ entry: row, settled, progressed });
  } catch (err) {
    return handleError(err);
  }
}
