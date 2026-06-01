import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { bets, fixtures } from '@/db/schema';

interface Preds {
  q1?: string | null;
  q2?: string | null;
  q3?: string | null;
  q4?: string | null;
}

/**
 * Scores a single bet under the partial-credit rule:
 *   - Only questions the player actually answered are counted.
 *   - For q2 (first scorer) and q4 (cards), also requires the admin to have entered the answer;
 *     if the admin input is missing, that question is excluded.
 *   - Each correct answer earns wager / answeredCount points (rounded).
 *   - 0 correct → loss, pointsAwarded = 0.
 *   - ≥1 correct → win, pointsAwarded = wager + round(correctCount × wager / answeredCount).
 *
 * Settlement is expected to be blocked upstream until all admin inputs are present,
 * so the q2/q4 guard here is a safety net rather than the primary gate.
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

  let answered = 0;
  let correct  = 0;

  if (preds.q1) {
    answered++;
    if (preds.q1 === result) correct++;
  }

  if (preds.q2 && firstScorer !== null) {
    answered++;
    if (preds.q2 === firstScorer) correct++;
  }

  if (preds.q3) {
    answered++;
    const ok =
      (preds.q3 === '0–1 Goals' && total <= 1) ||
      (preds.q3 === '2–3 Goals' && total >= 2 && total <= 3) ||
      (preds.q3 === '4+ Goals'  && total >= 4);
    if (ok) correct++;
  }

  if (preds.q4 && totalCards !== null) {
    answered++;
    const ok =
      (preds.q4 === '0–2 Cards' && totalCards <= 2) ||
      (preds.q4 === '3–5 Cards' && totalCards >= 3 && totalCards <= 5) ||
      (preds.q4 === '6+ Cards'  && totalCards >= 6);
    if (ok) correct++;
  }

  if (answered === 0 || correct === 0) {
    return { outcome: 'loss', pointsAwarded: 0 };
  }

  const pts = Math.round(correct * wager / answered);
  return { outcome: 'win', pointsAwarded: pts };
}

/**
 * Settles all pending bets for a match.
 * Returns 0 and does nothing if firstScorer or totalCards is not yet entered —
 * every subsequent PATCH to the fixture will retry, so the last admin input
 * (whichever of firstScorer / totalCards is entered last) triggers final settlement.
 */
export async function settlePendingBets(matchId: number, scoreA: number, scoreB: number): Promise<number> {
  const [match] = await db.select().from(fixtures).where(eq(fixtures.id, matchId));
  const firstScorer = match?.firstScorer ?? null;
  const totalCards  = match?.totalCards  ?? null;

  if (firstScorer === null || totalCards === null) return 0;

  const pending = await db
    .select()
    .from(bets)
    .where(and(eq(bets.matchId, matchId), eq(bets.outcome, 'pending')));

  for (const b of pending) {
    const { outcome, pointsAwarded } = evaluateBet(b, scoreA, scoreB, firstScorer, totalCards, b.wager);
    await db.update(bets).set({ outcome, pointsAwarded }).where(eq(bets.id, b.id));
  }
  return pending.length;
}
