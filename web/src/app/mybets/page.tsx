'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, type Bet, type Match } from '@/lib/api';
import { useAuth, useToast } from '../providers';

const QLABEL: Record<string, string> = {
  q1: 'Result', q2: 'First Goal', q3: 'Goals', q4: 'Cards',
};

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
    wins:    bets.filter(b => b.outcome === 'win').length,
    losses:  bets.filter(b => b.outcome === 'loss').length,
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
        <div className="bstat"><div className="bn" style={{ color: '#2ecc71' }}>{counts.wins}</div><div className="bl">Wins</div></div>
        <div className="bstat"><div className="bn" style={{ color: '#e74c3c' }}>{counts.losses}</div><div className="bl">Losses</div></div>
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
            const preds = { q1: b.q1, q2: b.q2, q3: b.q3, q4: b.q4 };
            const plines = Object.entries(preds)
              .filter(([, v]) => v)
              .map(([k, v]) => <span key={k}>{QLABEL[k]}: <strong>{v}</strong></span>);
            const outClass = b.outcome === 'win' ? 'out-win' : b.outcome === 'loss' ? 'out-lose' : 'out-pend';
            const outText  =
              b.outcome === 'win'  ? `+${b.wager} pts ✓` :
              b.outcome === 'loss' ? `−${b.wager} pts ✗` :
                                     `${b.wager} pts (pending)`;
            return (
              <div className="bet-card" key={b.id}>
                <div>
                  <div className="bet-match">
                    {m?.flagA || '⚽'} {m?.teamA || '?'} vs {m?.teamB || '?'} {m?.flagB || ''}
                  </div>
                  <div className="bet-preds">
                    {plines.length > 0
                      ? plines.reduce<React.ReactNode[]>((acc, n, i) => i === 0 ? [n] : [...acc, ' · ', n], [])
                      : <em>no predictions recorded</em>}
                  </div>
                </div>
                <div className="bet-right">
                  <div className="bet-amt">{b.wager} pts wagered</div>
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
