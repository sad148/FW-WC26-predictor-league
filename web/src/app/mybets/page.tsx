'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, type Bet, type Match } from '@/lib/api';
import { useAuth, useToast } from '../providers';

const QLABEL: Record<string, string> = {
  q1: 'Result', q2: 'First Goal', q3: 'Goals', q4: 'Cards',
};

function qCorrect(b: Bet, m: Match): Record<string, boolean | null> {
  if (m.scoreA === null || m.scoreB === null || m.firstScorer === null || m.totalCards === null) {
    return { q1: null, q2: null, q3: null, q4: null };
  }
  const result = m.scoreA > m.scoreB ? 'Home Win' : m.scoreB > m.scoreA ? 'Away Win' : 'Draw';
  const total  = m.scoreA + m.scoreB;
  return {
    q1: b.q1 ? b.q1 === result : null,
    q2: b.q2 ? b.q2 === m.firstScorer : null,
    q3: b.q3 ? (
      (b.q3 === '0–1 Goals' && total <= 1) ||
      (b.q3 === '2–3 Goals' && total >= 2 && total <= 3) ||
      (b.q3 === '4+ Goals'  && total >= 4)
    ) : null,
    q4: b.q4 ? (
      (b.q4 === '0–2 Cards' && m.totalCards <= 2) ||
      (b.q4 === '3–5 Cards' && m.totalCards >= 3 && m.totalCards <= 5) ||
      (b.q4 === '6+ Cards'  && m.totalCards >= 6)
    ) : null,
  };
}

export default function MyBetsPage() {
  const { user, isAdmin, isLoading } = useAuth();
  const { toast } = useToast();
  const [bets, setBets]     = useState<Bet[]>([]);
  const [matches, setMatch] = useState<Match[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user || isAdmin) return;
    Promise.all([api.myBets(), api.fixtures()])
      .then(([b, f]) => { setBets(b.bets); setMatch(f.matches); })
      .catch(e => toast('Error', (e as Error).message))
      .finally(() => setLoaded(true));
  }, [user, isAdmin, toast]);

  const matchById = useMemo(() => {
    const m = new Map<number, Match>();
    matches.forEach(x => m.set(x.id, x));
    return m;
  }, [matches]);

  const counts = useMemo(() => ({
    placed:  bets.length,
    pending: bets.filter(b => b.outcome === 'pending').length,
  }), [bets]);

  if (isLoading) return null;

  if (!user || isAdmin) {
    return (
      <section>
        <div className="sh"><div className="sh-title">MY BETS</div></div>
        <div className="empty-state">
          <div className="ei">🔒</div>
          <h3>{isAdmin ? 'Admins don\'t have bets' : 'Sign in to see your bets'}</h3>
          <p>
            {isAdmin
              ? 'Admin accounts don\'t place bets. Log out of admin and use a player account.'
              : <>Head to <Link href="/account" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Account</Link> to log in or register.</>}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="sh">
        <div className="sh-title">MY BETS</div>
        <div className="sh-sub">Your prediction history</div>
      </div>

      <div className="bstats">
        <div className="bstat"><div className="bn">{counts.placed}</div><div className="bl">Placed</div></div>
        <div className="bstat"><div className="bn" style={{ color: 'var(--off)' }}>{counts.pending}</div><div className="bl">Pending</div></div>
      </div>

      {loaded && bets.length === 0 ? (
        <div className="empty-state">
          <div className="ei">🎯</div>
          <h3>No predictions yet</h3>
          <p>Head to <Link href="/matches" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Matches</Link> and place your first bet!</p>
        </div>
      ) : (
        <div className="bets-list">
          {[...bets].reverse().map(b => {
            const m = matchById.get(b.matchId);
            const settled = b.outcome !== 'pending';
            const correct = m && settled ? qCorrect(b, m) : null;
            const preds = { q1: b.q1, q2: b.q2, q3: b.q3, q4: b.q4 };
            const plines = Object.entries(preds)
              .filter(([, v]) => v)
              .map(([k, v]) => {
                const mark = correct?.[k];
                const marker = mark === true ? <span style={{ color: '#2ecc71' }}> ✓</span>
                             : mark === false ? <span style={{ color: '#e74c3c' }}> ✗</span>
                             : null;
                return <span key={k}>{QLABEL[k]}: <strong>{v}</strong>{marker}</span>;
              });
            const outClass = b.outcome === 'pending' ? 'out-pend' : 'out-win';
            const outText  = b.outcome === 'pending'
              ? `${b.wager} coins (pending)`
              : `${b.pointsAwarded} coins back`;
            return (
              <div className="bet-card" key={b.id}>
                <div>
                  <div className="bet-match">
                    {m?.teamA || '?'} vs {m?.teamB || '?'}
                  </div>
                  <div className="bet-preds">
                    {plines.length > 0
                      ? plines.reduce<React.ReactNode[]>((acc, n, i) => i === 0 ? [n] : [...acc, ' · ', n], [])
                      : <em>no predictions recorded</em>}
                  </div>
                </div>
                <div className="bet-right">
                  <div className="bet-amt">{b.wager} coins wagered</div>
                  <div className={`bet-out ${outClass}`}>{outText}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
