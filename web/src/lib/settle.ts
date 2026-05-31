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
 * Returns 'win' or 'loss' for a single bet.
 * A bet WINS if at least one answered prediction is correct (any-correct rule).
 * A bet LOSES only when every evaluatable answered prediction is wrong.
 *
 *   Q1 (result):    derived from scoreA/scoreB — always evaluatable.
 *   Q2 (1st goal):  checked against admin-entered firstScorer — skipped if null.
 *   Q3 (goals O/U): derived from scoreA + scoreB — always evaluatable.
 *   Q4 (cards):     checked against admin-entered totalCards — skipped if null.
 */
export function evaluateBet(
  preds: Preds,
  scoreA: number,
  scoreB: number,
  firstScorer: string | null = null,
  totalCards:  number | null = null,
): 'win' | 'loss' {
  const result = scoreA > scoreB ? 'Home Win' : scoreB > scoreA ? 'Away Win' : 'Draw';
  const total  = scoreA + scoreB;

  // Q1 — match result
  if (preds.q1 && preds.q1 === result) return 'win';

  // Q2 — first scorer (only evaluatable when admin has entered the answer)
  if (preds.q2 && firstScorer && preds.q2 === firstScorer) return 'win';

  // Q3 — goals over/under
  if (preds.q3) {
    const correct =
      (preds.q3 === '0–1 Goals' && total <= 1) ||
      (preds.q3 === '2–3 Goals' && total >= 2 && total <= 3) ||
      (preds.q3 === '4+ Goals'  && total >= 4);
    if (correct) return 'win';
  }

  // Q4 — total cards (only evaluatable when admin has entered the answer)
  if (preds.q4 && totalCards !== null) {
    const correct =
      (preds.q4 === '0–2 Cards' && totalCards <= 2) ||
      (preds.q4 === '3–5 Cards' && totalCards >= 3 && totalCards <= 5) ||
      (preds.q4 === '6+ Cards'  && totalCards >= 6);
    if (correct) return 'win';
  }

  return 'loss';
}

/** Flip every pending bet on this match to win/loss based on the score + admin-entered Q2/Q4 answers. */
export async function settlePendingBets(matchId: number, scoreA: number, scoreB: number): Promise<number> {
  const [match] = await db.select().from(fixtures).where(eq(fixtures.id, matchId));
  const firstScorer = match?.firstScorer ?? null;
  const totalCards  = match?.totalCards  ?? null;

  const pending = await db
    .select()
    .from(bets)
    .where(and(eq(bets.matchId, matchId), eq(bets.outcome, 'pending')));

  for (const b of pending) {
    const outcome = evaluateBet(b, scoreA, scoreB, firstScorer, totalCards);
    await db.update(bets).set({ outcome }).where(eq(bets.id, b.id));
  }
  return pending.length;
}
