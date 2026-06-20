import { and, eq, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { bets, fixtures, fixturePenalties, leagueMembers } from '@/db/schema';

interface Preds {
  q1?: string | null;
  q2?: string | null;
  q3?: string | null;
  q4?: string | null;
}

/**
 * Scores a single bet:
 *   - The wager is always deducted upfront (handled in the leaderboard wallet query).
 *   - There are always 4 questions; unanswered questions count as incorrect.
 *   - Each question is worth wager / 4 points.
 *   - A correct answer pays back 2× that unit; a wrong/unanswered answer pays back 0.
 *   - pointsAwarded = round(2 × correctCount × wager / 4)
 *   - 0 correct → loss, pointsAwarded = 0 (full wager lost).
 *   - ≥1 correct → win.
 */
export function evaluateBet(
  preds: Preds,
  scoreA: number,
  scoreB: number,
  firstScorer: string | null,
  totalCards:  number | null,
  wager: number,
): { outcome: 'win' | 'loss'; pointsAwarded: number } {
  const result = scoreA > scoreB ? 'Home Win' : scoreB > scoreA ? 'Away Win' : 'Draw';
  const total  = scoreA + scoreB;

  let correct = 0;

  if (preds.q1 && preds.q1 === result) correct++;

  if (preds.q2 && firstScorer !== null && preds.q2 === firstScorer) correct++;

  if (preds.q3) {
    const ok =
      (preds.q3 === '0–1 Goals' && total <= 1) ||
      (preds.q3 === '2–3 Goals' && total >= 2 && total <= 3) ||
      (preds.q3 === '4+ Goals'  && total >= 4);
    if (ok) correct++;
  }

  if (preds.q4 && totalCards !== null) {
    const ok =
      (preds.q4 === '0–2 Cards' && totalCards <= 2) ||
      (preds.q4 === '3–5 Cards' && totalCards >= 3 && totalCards <= 5) ||
      (preds.q4 === '6+ Cards'  && totalCards >= 6);
    if (ok) correct++;
  }

  const pts = Math.round(2 * correct * wager / 4);
  return { outcome: correct > 0 ? 'win' : 'loss', pointsAwarded: pts };
}

/**
 * Settles (or re-settles) all bets for a match.
 * Returns 0 and does nothing if firstScorer or totalCards is not yet entered —
 * every subsequent PATCH to the fixture will retry, so the last admin input
 * (whichever of firstScorer / totalCards is entered last) triggers final settlement.
 * Re-evaluates already-settled bets so that admin corrections propagate.
 */
export async function settlePendingBets(matchId: number, scoreA: number, scoreB: number): Promise<number> {
  const [match] = await db.select().from(fixtures).where(eq(fixtures.id, matchId));
  const firstScorer = match?.firstScorer ?? null;
  const totalCards  = match?.totalCards  ?? null;

  if (firstScorer === null || totalCards === null) return 0;

  const allBets = await db
    .select()
    .from(bets)
    .where(eq(bets.matchId, matchId));

  for (const b of allBets) {
    const { outcome, pointsAwarded } = evaluateBet(b, scoreA, scoreB, firstScorer, totalCards, b.wager);
    await db.update(bets).set({ outcome, pointsAwarded }).where(eq(bets.id, b.id));
  }

  await applyMissedBetPenalties(matchId);

  return allBets.length;
}

/**
 * For every league, deducts 4 coins from each member who joined before the
 * fixture's betting window closed but placed no bet on that fixture.
 * Idempotent: ON CONFLICT DO NOTHING on (user, match, league).
 */
async function applyMissedBetPenalties(matchId: number): Promise<void> {
  const [match] = await db.select().from(fixtures).where(eq(fixtures.id, matchId));
  if (!match?.endTime) return;

  const leagues = await db
    .selectDistinct({ leagueId: leagueMembers.leagueId })
    .from(leagueMembers);

  for (const { leagueId } of leagues) {
    const eligible = await db
      .select({ userId: leagueMembers.userId })
      .from(leagueMembers)
      .where(and(
        eq(leagueMembers.leagueId, leagueId),
        lt(leagueMembers.joinedAt, match.endTime),
      ));

    const bettorRows = await db
      .select({ userId: bets.userId })
      .from(bets)
      .where(and(eq(bets.matchId, matchId), eq(bets.leagueId, leagueId)));

    const bettorIds = new Set(bettorRows.map((b) => b.userId));

    for (const { userId } of eligible) {
      if (!bettorIds.has(userId)) {
        await db
          .insert(fixturePenalties)
          .values({ userId, leagueId, matchId, coinsDeducted: 4 })
          .onConflictDoNothing();
      }
    }
  }
}
