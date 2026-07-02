'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Bet, type Match } from '@/lib/api';
import { formatLocal, matchState, MATCH_STATE_LABEL, type MatchState } from '@/lib/time';
import { useAuth, useToast } from '../providers';

type Filter = 'all' | 'group' | 'knockout' | 'open' | 'complete';

const STATE_CLS: Record<MatchState, string> = {
  unscheduled: 'st-up',
  scheduled:   'st-up',
  open:        'st-live',
  closed:      'st-up',
  complete:    'st-done',
};

function maxWagerForMatch(m: Match): number {
  if (m.phase !== 'knockout') return 8;
  const r = (m.groupName || '').toUpperCase();
  if (r === 'SF' || r === 'FINAL' || r === 'THIRD') return 30;
  if (r === 'R16' || r === 'QF') return 16;
  return 8;
}

const Q1 = ['Home Win', 'Draw', 'Away Win'] as const;
const Q3 = ['0–1 Goals', '2–3 Goals', '4+ Goals'] as const;
const Q4 = ['0–2 Cards', '3–5 Cards', '6+ Cards'] as const;

interface Draft {
  q1?: string;
  q2?: string;
  q3?: string;
  q4?: string;
  wager: number;
}

export default function MatchesPage() {
  const { user, isAdmin, wallet, bailoutEligible, refresh } = useAuth();
  const { toast }          = useToast();
  const [matches, setMatches] = useState<Match[]>([]);
  const [bets, setBets]       = useState<Bet[]>([]);
  const [filter, setFilter]   = useState<Filter>('open');
  const [drafts, setDrafts]     = useState<Record<number, Draft>>({});
  const [wagerRaw, setWagerRaw] = useState<Record<number, string>>({});
  const [submitting, setSub]    = useState<number | null>(null);
  const [bailing, setBailing]   = useState(false);

  const loadFixtures = useCallback(async () => {
    try {
      const r = await api.fixtures();
      setMatches(r.matches);
    } catch (e) { toast('Error', (e as Error).message); }
  }, [toast]);

  const loadBets = useCallback(async () => {
    if (!user || isAdmin) { setBets([]); return; }
    try {
      const r = await api.myBets();
      setBets(r.bets);
    } catch { /* not logged in, ignore */ }
  }, [user, isAdmin, toast]);

  useEffect(() => { loadFixtures(); }, [loadFixtures]);
  useEffect(() => { loadBets();     }, [loadBets]);

  const betByMatch = useMemo(() => {
    const m = new Map<number, Bet>();
    bets.forEach(b => m.set(b.matchId, b));
    return m;
  }, [bets]);

  // Rebind 'now' once per render — that's enough to flip a card from "open" to "closed"
  // when the user reloads. (Polling for real-time transitions is out of scope here.)
  const now = Date.now();

  const filtered = useMemo(() => matches.filter(m => {
    const state = matchState(m, now);
    if (filter === 'all')      return true;
    if (filter === 'group')    return m.phase === 'group';
    if (filter === 'knockout') return m.phase === 'knockout';
    if (filter === 'open')     return state === 'open';
    if (filter === 'complete') return state === 'complete';
    return true;
  }), [matches, filter, now]);

  function setDraft(matchId: number, patch: Partial<Draft>) {
    setDrafts(d => {
      const base: Draft = d[matchId] ?? { wager: betByMatch.get(matchId)?.wager ?? 2 };
      return { ...d, [matchId]: { ...base, ...patch } };
    });
  }

  async function doBailout() {
    setBailing(true);
    try {
      await api.bailout();
      toast('Bailout!', 'You received 100 coins. −10 pts deducted from your score.');
      await refresh();
    } catch (e) {
      toast('Error', (e as Error).message);
    } finally {
      setBailing(false);
    }
  }

  async function submit(matchId: number) {
    if (!user) { toast('Sign in first', 'Open Account to log in or register.'); return; }
    if (isAdmin) { toast('Admin can\'t bet', 'Register a separate player account.'); return; }
    const draft    = drafts[matchId];
    const existing = betByMatch.get(matchId);
    const q1    = draft?.q1    ?? existing?.q1    ?? undefined;
    const q2    = draft?.q2    ?? existing?.q2    ?? undefined;
    const q3    = draft?.q3    ?? existing?.q3    ?? undefined;
    const q4    = draft?.q4    ?? existing?.q4    ?? undefined;
    const wager = draft?.wager ?? existing?.wager ?? 2;
    if (!q1 && !q2 && !q3 && !q4) {
      toast('No predictions!', 'Select at least one answer.');
      return;
    }
    setSub(matchId);
    try {
      await api.placeBet({ matchId, q1, q2, q3, q4, wager });
      toast(existing ? 'Bet updated! ✏️' : 'Bet placed! 🎯', `${wager} coins wagered.`);
      setDrafts(d => { const c = { ...d }; delete c[matchId]; return c; });
      await loadBets();
      await refresh();
    } catch (e) {
      toast('Error', (e as Error).message);
    } finally {
      setSub(null);
    }
  }

  return (
    <section>
      <div className="sh">
        <div className="sh-title">MATCHES</div>
        <div className="sh-sub">Lock predictions before kickoff · 8 coins max per match</div>
      </div>

      <div className="phase-tabs">
        {(['all','group','knockout','open','complete'] as Filter[]).map(f => (
          <button
            key={f}
            type="button"
            className={`ptab${filter === f ? ' on' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All'
             : f === 'group' ? 'Group Stage'
             : f === 'knockout' ? 'Knockout'
             : f === 'open' ? '● Open Now'
             : '✓ Completed'}
          </button>
        ))}
      </div>

      {!user && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '12px 16px', marginBottom: '1.25rem', fontSize: 13, color: 'var(--off)'
        }}>
          You're not signed in — predictions are read-only. <Link href="/account" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Sign in</Link> to place bets.
        </div>
      )}
      {isAdmin && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '12px 16px', marginBottom: '1.25rem', fontSize: 13, color: 'var(--can2)'
        }}>
          Admin accounts can't place bets. Log out of admin and register a player account to play.
        </div>
      )}
      {user && !isAdmin && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '12px 16px', marginBottom: '1.25rem', fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span style={{ color: 'var(--off)' }}>
            Trade <strong style={{ color: 'var(--gold)' }}>10 pts</strong> from your trivia/bracket score for <strong style={{ color: 'var(--gold)' }}>100 coins</strong>.
          </span>
          <button
            className="wsubmit"
            disabled={!bailoutEligible || bailing}
            onClick={doBailout}
          >
            {bailing ? 'Processing…' : 'Bailout'}
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="ei">📋</div>
          <h3>No matches</h3>
          <p>{matches.length === 0
            ? 'No fixtures yet. Admin can seed sample fixtures from the Admin page.'
            : 'No matches in this filter.'}
          </p>
        </div>
      ) : (
        <div className="matches-grid-2">
          {filtered.map(m => {
            const existing = betByMatch.get(m.id);
            const state    = matchState(m, now);
            const draft    = drafts[m.id] || { wager: existing?.wager ?? 2 };
            const canBet   = !!user && !isAdmin && state === 'open';
            const showForm = state !== 'complete';

            return (
              <div className="mc" key={m.id}>
                <div className="mc-top">
                  <span>
                    {m.phase === 'group' ? `Group ${m.groupName || '?'}` : (m.groupName || 'Knockout')}
                  </span>
                  <span className={`st ${STATE_CLS[state]}`}>{MATCH_STATE_LABEL[state]}</span>
                </div>
                <div className="mc-body">
                  <div className="team">
                    <span className="tn">{m.teamA}</span>
                  </div>
                  <div className="mc-score">
                    {state === 'complete'
                      ? <div className="sc-nums">{m.scoreA ?? 0} – {m.scoreB ?? 0}</div>
                      : <div className="sc-vs">VS</div>}
                  </div>
                  <div className="team">
                    <span className="tn">{m.teamB}</span>
                  </div>
                </div>

                {/* Betting window in the user's local timezone. */}
                <div style={{
                  borderTop: '1px solid var(--border)',
                  padding: '8px 14px',
                  fontFamily: 'var(--font-cond)',
                  fontSize: 12,
                  color: 'var(--off)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                }}>
                  <span>Opens: <strong style={{ color: 'var(--gold2)' }}>{formatLocal(m.startTime)}</strong></span>
                  <span>Closes: <strong style={{ color: 'var(--gold2)' }}>{formatLocal(m.endTime)}</strong></span>
                </div>

                {showForm && (
                  <>
                    <div className="mc-preds">
                      <PredRow label="Q1 Result"        opts={[...Q1]}
                               value={draft.q1 ?? existing?.q1}
                               disabled={!canBet}
                               onPick={(v) => setDraft(m.id, { q1: v })} />
                      <PredRow label="Q2 First Goal"    opts={[m.teamA, m.teamB, 'No Goal']}
                               value={draft.q2 ?? existing?.q2}
                               disabled={!canBet}
                               onPick={(v) => setDraft(m.id, { q2: v })} />
                      <PredRow label="Q3 Goals O/U"     opts={[...Q3]}
                               value={draft.q3 ?? existing?.q3}
                               disabled={!canBet}
                               onPick={(v) => setDraft(m.id, { q3: v })} />
                      <PredRow label="Q4 Total Cards"   opts={[...Q4]}
                               value={draft.q4 ?? existing?.q4}
                               disabled={!canBet}
                               onPick={(v) => setDraft(m.id, { q4: v })} />
                    </div>
                    <div className="mc-wager">
                      <span className="wlabel">Wager</span>
                      <input
                        className="winput"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={wagerRaw[m.id] ?? String(draft.wager)}
                        disabled={!canBet}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          setWagerRaw(r => ({ ...r, [m.id]: raw }));
                          if (raw !== '') {
                            const v = Math.min(maxWagerForMatch(m), Math.max(1, parseInt(raw)));
                            setDraft(m.id, { wager: v });
                          }
                        }}
                        onBlur={() => {
                          const v = draft.wager || 2;
                          setWagerRaw(r => ({ ...r, [m.id]: String(v) }));
                          setDraft(m.id, { wager: v });
                        }}
                      />
                      <span className="wmax">coins / {maxWagerForMatch(m)} max</span>
                      {existing && !canBet
                        ? <span className="saved-badge">✓ Submitted</span>
                        : <button
                            className="wsubmit"
                            disabled={!canBet || submitting === m.id}
                            onClick={() => submit(m.id)}
                          >{
                            submitting === m.id ? 'Submitting…'
                            : state === 'scheduled'   ? 'Opens later'
                            : state === 'closed'      ? 'Closed'
                            : state === 'unscheduled' ? 'Awaiting times'
                            : existing ? 'Update Bet'
                            : 'Place Bet'
                          }</button>
                      }
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PredRow({ label, opts, value, disabled, onPick }: {
  label: string;
  opts: string[];
  value?: string | null;
  disabled: boolean;
  onPick: (v: string) => void;
}) {
  return (
    <div className="prow">
      <span className="plabel">{label}</span>
      <div className="popts">
        {opts.map(o => (
          <button
            key={o}
            type="button"
            className={`popt${value === o ? ' sel' : ''}`}
            disabled={disabled}
            onClick={() => onPick(o)}
          >{o}</button>
        ))}
      </div>
    </div>
  );
}
