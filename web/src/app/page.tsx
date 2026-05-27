'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type LeaderboardRow, type Match } from '@/lib/api';
import { useAuth } from './providers';

export default function HomePage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [board, setBoard]     = useState<LeaderboardRow[]>([]);

  useEffect(() => {
    api.fixtures().then(r => setMatches(r.matches)).catch(() => {});
    api.leaderboard().then(r => setBoard(r.leaderboard)).catch(() => {});
  }, []);

  const myRow   = board.find(p => p.playerId === user?.playerId);
  const wallet  = myRow?.wallet ?? 100;
  const playerCount = board.length;

  return (
    <section>
      <div className="hero">
        <div className="hero-bg">26</div>
        <div className="hero-badge">⚽ June 11 — July 19, 2026</div>
        <h1 className="hero-title">
          <span className="t-gold">FANTASY</span><br />
          <span className="t-can">PRE</span><span className="t-mex">DIC</span><span className="t-usa">TOR</span>
        </h1>
        <p className="hero-sub">Pick results. Wager points. Ride the bracket. One trophy. Who calls it?</p>
        <div className="hero-flags">
          <span className="flag-pill fp-can">🇨🇦 Canada</span>
          <span className="flag-pill fp-mex">🇲🇽 Mexico</span>
          <span className="flag-pill fp-usa">🇺🇸 USA</span>
        </div>
        <div className="hero-kpi">
          <div className="kpi"><div className="n">{matches.length}</div><div className="l">Matches</div></div>
          <div className="kpi"><div className="n">{playerCount}</div><div className="l">Players</div></div>
          <div className="kpi"><div className="n">{wallet}</div><div className="l">Your Pts</div></div>
        </div>
        <div className="hero-btns">
          <Link className="btn-gold" href="/matches">Make Predictions →</Link>
          <Link className="btn-outline" href="/leaderboard">Leaderboard</Link>
        </div>
      </div>

      <div className="sh"><div className="sh-title">HOW IT WORKS</div></div>
      <div className="how-grid">
        <div className="how-card">
          <div className="how-icon">💰</div>
          <div className="how-h">100 Points to Start</div>
          <p className="how-p">Every player is provisioned exactly 100 pts on registration. This is your betting stash — guard it.</p>
        </div>
        <div className="how-card">
          <div className="how-icon">🎯</div>
          <div className="how-h">4 Questions Per Match</div>
          <p className="how-p">Q1 Result · Q2 First Scorer · Q3 Goals O/U · Q4 Clean Sheet. Wager up to 10 pts total per match.</p>
        </div>
        <div className="how-card">
          <div className="how-icon">📈</div>
          <div className="how-h">Double or Nothing</div>
          <p className="how-p">Win doubles your wager (+100% profit). Wrong predictions forfeit the staked pts. Bankruptcy = read-only.</p>
        </div>
        <div className="how-card">
          <div className="how-icon">🏆</div>
          <div className="how-h">Bracket Bonus (Phase 2)</div>
          <p className="how-p">Knockout predictions earn 3× pts. Predict the winner through every round for compounding multipliers.</p>
        </div>
      </div>
    </section>
  );
}
