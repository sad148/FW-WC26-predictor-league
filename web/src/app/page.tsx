"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type LeaderboardRow, type Match } from "@/lib/api";
import { useAuth } from "./providers";

export default function HomePage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);

  useEffect(() => {
    api
      .fixtures()
      .then((r) => setMatches(r.matches))
      .catch(() => {});
    api
      .leaderboard()
      .then((r) => setBoard(r.leaderboard))
      .catch(() => {});
  }, []);

  const myRow = board.find((p) => p.playerId === user?.playerId);
  const wallet = myRow?.wallet ?? 100;
  const playerCount = board.length;

  return (
    <section>
      <div className="hero">
        <div className="hero-bg">26</div>
        <div className="hero-badge">⚽ June 11 — July 19, 2026</div>
        <h1 className="hero-title">
          <span className="t-gold">FANTASY</span>
          <br />
          <span className="t-can">PRE</span>
          <span className="t-mex">DIC</span>
          <span className="t-usa">TOR</span>
        </h1>
        <p className="hero-sub">
          Pick results. Wager coins. Ride the bracket. One trophy. Who calls
          it?
        </p>
        <div className="hero-flags">
          <span className="flag-pill fp-can">Canada</span>
          <span className="flag-pill fp-mex">Mexico</span>
          <span className="flag-pill fp-usa">USA</span>
        </div>
        <div className="hero-kpi">
          <div className="kpi">
            <div className="n">{matches.length}</div>
            <div className="l">Matches</div>
          </div>
          <div className="kpi">
            <div className="n">{playerCount}</div>
            <div className="l">Players</div>
          </div>
          <div className="kpi">
            <div className="n">{wallet}</div>
            <div className="l">Your Coins</div>
          </div>
        </div>
        <div className="hero-btns">
          <Link className="btn-gold" href="/matches">
            Make Predictions →
          </Link>
          <Link className="btn-outline" href="/leaderboard">
            Leaderboard
          </Link>
        </div>
      </div>

      {/* ── Rules ─────────────────────────────────────────────────── */}
      <div className="sh" style={{ marginTop: '2rem' }}>
        <div className="sh-title">THE LAWS OF THE LAND</div>
        <div className="sh-sub">Read them. Learn them. Don't come crying later.</div>
      </div>

      {/* Key numbers strip */}
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: '1.5rem',
      }}>
        {[
          { n: '100', l: 'Starting Coins' },
          { n: '8',   l: 'Max Wager / Match' },
          { n: '16',  l: 'Max Win / Match' },
          { n: '15',  l: 'Trivia Questions' },
        ].map(({ n, l }) => (
          <div key={l} style={{
            flex: '1 1 120px', background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '14px 18px', textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--gold)', lineHeight: 1 }}>{n}</div>
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--off)', marginTop: 4, letterSpacing: '.5px' }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Rule cards */}
      <div className="how-grid">

        <div className="how-card">
          <div className="how-icon">🪙</div>
          <div className="how-h">You Start With 100. Don't Blow It All on Day 1.</div>
          <p className="how-p">
            Everyone kicks off with 100 coins in the war chest. Think of it as your dignity —
            once it's gone, it's gone. There's a bailout option but it costs ranking points.
            Spend wisely, or don't. We'll be watching.
          </p>
        </div>

        <div className="how-card">
          <div className="how-icon">⚽</div>
          <div className="how-h">4 Questions Per Match. No Half-Measures.</div>
          <p className="how-p">
            Every match comes loaded: Result · First Scorer · Goals O/U · Total Cards.
            Wager up to 8 coins per match, split equally across all 4.
            Nail them all and you double up. Go 0/4 and watch your coins vanish in real-time. Fun!
          </p>
        </div>

        <div className="how-card">
          <div className="how-icon">🔢</div>
          <div className="how-h">Keep It Even, Genius.</div>
          <p className="how-p">
            Your wager divides equally across 4 questions. Bet 4 → 1 coin each.
            Bet 8 → 2 coins each. Use odd numbers and you're basically
            arm-wrestling the algorithm. Just use even numbers. We beg you.
          </p>
        </div>

        <div className="how-card">
          <div className="how-icon">⏱️</div>
          <div className="how-h">Deadlines Are Not Suggestions.</div>
          <p className="how-p">
            Betting closes at kickoff for each individual game. Not 5 minutes after.
            Not when you "just remembered." At kickoff. We don't care about your timezone,
            your alarm clock, or your excuses. No exceptions. Ever.
          </p>
        </div>

        <div className="how-card">
          <div className="how-icon">🧠</div>
          <div className="how-h">15 Trivia Questions. Your Brain Is Required.</div>
          <p className="how-p">
            15 predictor-style questions for the group stage are live right now.
            Lock in your answers by 18th June — every team will have played at least
            one match by then, so you have zero excuses. Head to Trivia and prove
            you're not just winging it.
          </p>
        </div>

        <div className="how-card">
          <div className="how-icon">📊</div>
          <div className="how-h">Call the Group Standings. Own It.</div>
          <p className="how-p">
            Think you know how each group ends up? Put it on record in the Brackets section.
            Pick the final 1st–4th standings for every group before 11th June.
            Wrong prediction? We'll be sure to remind you. Loudly.
          </p>
        </div>

        <div className="how-card">
          <div className="how-icon">🔮</div>
          <div className="how-h">Knockouts Are Coming. Stay Alert.</div>
          <p className="how-p">
            Once the group stage wraps up, the knockout bracket opens with fresh slots
            to fill. Come back, drop your predictions, and pray your dark horse
            hasn't already been sent home in tears. Every correct pick = 3 pts.
          </p>
        </div>

        <div className="how-card">
          <div className="how-icon">📡</div>
          <div className="how-h">We Trust Fotmob. Mostly.</div>
          <p className="how-p">
            All stats are pulled from Fotmob. If Fotmob doesn't have it,
            Whoscored steps in as backup. If neither has it — it didn't happen.
            No disputes. No appeals. No refunds. The data is the data.
          </p>
        </div>

      </div>

      {/* Closing banner */}
      <div style={{
        margin: '1.5rem 0 2rem',
        background: 'linear-gradient(135deg, rgba(192,150,60,0.12), rgba(0,168,107,0.08))',
        border: '1px solid rgba(192,150,60,0.3)',
        borderRadius: 12, padding: '20px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--gold)', marginBottom: 4 }}>
            🏆 Most Points Wins. Simple.
          </div>
          <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--off)', lineHeight: 1.6 }}>
            Coins from Wagers + Trivia + Brackets — whoever stacks the most by the final whistle<br />
            takes the glory and the eternal right to say <em style={{ color: 'var(--gold2)' }}>"I told you so."</em>
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: 1 }}>
          <span style={{ color: 'var(--can2)' }}>Good </span>
          <span style={{ color: 'var(--mex2)' }}>Luck, </span>
          <span style={{ color: 'var(--gold)' }}>Have Fun!</span>
        </div>
      </div>
    </section>
  );
}
