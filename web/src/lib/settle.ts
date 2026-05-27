import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { bets } from '@/db/schema';

interface Preds {
  q1?: string | null;
  q2?: string | null;
  q3?: string | null;
  q4?: string | null;
}

/** Mirror of the Apps Script checkPredictions: returns 'win' or 'loss' for a single bet. */
export function evaluateBet(preds: Preds, scoreA: number, scoreB: number): 'win' | 'loss' {
  const result = scoreA > scoreB ? 'Home Win' : scoreB > scoreA ? 'Away Win' : 'Draw';
  if (preds.q1 && preds.q1 !== result) return 'loss';

  const total = scoreA + scoreB;
  if (preds.q3 === '0–1 Goals' && total > 1) return 'loss';
  if (preds.q3 === '2–3 Goals' && (total < 2 || total > 3)) return 'loss';
  if (preds.q3 === '4+ Goals' && total < 4) return 'loss';

  const cleanSheet = scoreA === 0 || scoreB === 0;
  if (preds.q4 === 'Yes' && !cleanSheet) return 'loss';
  if (preds.q4 === 'No'  &&  cleanSheet) return 'loss';

  return 'win';
}

/** Flip every pending bet on this match to win/loss based on the actual score. Returns count settled. */
export async function settlePendingBets(matchId: number, scoreA: number, scoreB: number): Promise<number> {
  const pending = await db
    .select()
    .from(bets)
    .where(and(eq(bets.matchId, matchId), eq(bets.outcome, 'pending')));

  for (const b of pending) {
    const outcome = evaluateBet(b, scoreA, scoreB);
    await db.update(bets).set({ outcome }).where(eq(bets.id, b.id));
  }
  return pending.length;
}
