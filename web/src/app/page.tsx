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
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
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
          <div className="how-h">You Start With 100 Coins. Guard Them.</div>
          <p className="how-p">
            Every player kicks off with 100 shiny coins. This is your war chest — not a donation.
            Spend recklessly and you'll be watching from the sidelines while everyone else thrives.
            The coins are yours. The bad decisions will be too.
          </p>
        </div>

        <div className="how-card">
          <div className="how-icon">⚽</div>
          <div className="how-h">4 Questions Per Match. Zero Excuses.</div>
          <p className="how-p">
            Every match has 4 questions: Result · First Scorer · Goals O/U · Total Cards.
            Wager up to 8 coins per match — your bet is split equally across all 4.
            Bet 4 coins? Each question gets 1, and you stand to win back 8. Bet 8? You could pocket 16.
            Simple maths. Difficult execution.
          </p>
        </div>

        <div className="how-card">
          <div className="how-icon">🔢</div>
          <div className="how-h">Use Even Numbers or Face the Consequences.</div>
          <p className="how-p">
            Your wager splits equally across 4 questions — so stick to even numbers.
            Bet 4 → 1 coin per question. Bet 8 → 2 coins per question.
            Go rogue with odd numbers and you're personally responsible for whatever
            the algorithm does next. Don't say we didn't warn you.
          </p>
        </div>

        <div className="how-card">
          <div className="how-icon">⏱️</div>
          <div className="how-h">Deadlines Are Sacred. Full Stop.</div>
          <p className="how-p">
            Betting is open for all group games right now. Each match locks at kickoff —
            not a minute after, not "almost kickoff." At kickoff.
            Your timezone, your alarm, your dog eating your phone — none of it matters.
            No exceptions. This policy has no appeals process.
          </p>
        </div>

        <div className="how-card">
          <div className="how-icon">🆘</div>
          <div className="how-h">Broke? There's a Lifeline. It'll Cost You.</div>
          <p className="how-p">
            If you somehow burn through all 100 coins — congratulations on that achievement —
            you can claim 100 fresh coins via the Bailout option on the Matches page.
            The catch? It docks 10 points from your overall leaderboard score.
            A lifeline, not a cheat code.
          </p>
        </div>

        <div className="how-card">
          <div className="how-icon">🧠</div>
          <div className="how-h">15 Trivia Questions. Brain Cells Required.</div>
          <p className="how-p">
            15 predictor-style questions for the group stage are live right now.
            Lock in your answers by 18th June — every team will have played at least one
            match by then, so ignorance is not a valid defence.
            Point values are shown per question. Head to Trivia. Prove yourself.
          </p>
        </div>

        <div className="how-card">
          <div className="how-icon">📊</div>
          <div className="how-h">Call the Group Standings. Own It.</div>
          <p className="how-p">
            Think you know how each group shakes out? Commit to it.
            Head to the Brackets section and predict every group's final 1st–4th standings
            before 11th June. Wrong picks will be remembered. Correct ones will be celebrated.
            By you. Loudly. We're fine with that.
          </p>
        </div>

        <div className="how-card">
          <div className="how-icon">🔮</div>
          <div className="how-h">Knockouts Are Coming. Don't Sleep.</div>
          <p className="how-p">
            Once the group dust settles, the knockout bracket opens with fresh prediction slots.
            Come back, update your picks, and hope your dark horse hasn't already
            been eliminated in embarrassing fashion. Every correct knockout pick = 3 pts.
            Fresh groups, fresh chances, fresh heartbreaks.
          </p>
        </div>

        <div className="how-card">
          <div className="how-icon">📡</div>
          <div className="how-h">Fotmob Is the Referee. Accept It.</div>
          <p className="how-p">
            All stats are pulled from Fotmob. If Fotmob doesn't have it,
            Whoscored steps in as the backup official. If neither source has it —
            it simply did not happen. No disputes. No appeals. No alternative facts.
            The data is the data. Always.
          </p>
        </div>

        <div className="how-card">
          <div className="how-icon">🏆</div>
          <div className="how-h">How Winners Are Made.</div>
          <p className="how-p">
            Your final score = <strong style={{ color: 'var(--gold)' }}>Coins ÷ 10</strong> (converted to points) +{' '}
            <strong style={{ color: 'var(--gold2)' }}>Trivia pts</strong> +{' '}
            <strong style={{ color: 'var(--mex2)' }}>Bracket pts</strong>.
            The player with the most combined points at the final whistle wins —
            and earns the eternal right to say <em>"I told you so."</em>
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
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--off)', lineHeight: 1.8 }}>
          <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--gold)', marginBottom: 4, letterSpacing: .5 }}>
            RULES AND POINTS TO NOTE
          </span>
          These rules are final. Ignorance of the rules is not a valid excuse.<br />
          Any stats dispute will be resolved using Fotmob → Whoscored in that order.<br />
          The commissioner's decision is final. Yes, that means us.
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: 1, whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--can2)' }}>Good </span>
          <span style={{ color: 'var(--mex2)' }}>Luck, </span>
          <span style={{ color: 'var(--gold)' }}>Have Fun!</span>
        </div>
      </div>
    </section>
  );
}
