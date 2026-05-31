'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type BracketEntry, type BracketPhase, type BracketPick } from '@/lib/api';
import { formatLocal, windowState, WINDOW_STATE_LABEL, type WindowState } from '@/lib/time';
import { useAuth, useToast } from '../providers';

const PHASE_LABEL: Record<number, string> = {
  1: 'PHASE 1 · GROUP STANDINGS',
  2: 'PHASE 2 · KNOCKOUT TREE',
};

const WINDOW_CLS: Record<WindowState, string> = {
  unset:     'st-up',
  scheduled: 'st-up',
  open:      'st-live',
  closed:    'st-up',
};

export default function BracketsPage() {
  const { user, isAdmin, isLoading } = useAuth();
  const { toast } = useToast();
  const [entries,  setEntries]  = useState<BracketEntry[]>([]);
  const [picks,    setPicks]    = useState<BracketPick[]>([]);
  const [windows,  setWindows]  = useState<BracketPhase[]>([]);
  const [drafts,   setDrafts]   = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const loadEntries = useCallback(async () => {
    try {
      const [e, p] = await Promise.all([api.bracketEntries(), api.bracketPhases()]);
      setEntries(e.entries);
      setWindows(p.phases);
    } catch (err) { toast('Error', (err as Error).message); }
  }, [toast]);

  const loadPicks = useCallback(async () => {
    if (!user || isAdmin) { setPicks([]); return; }
    try {
      const r = await api.myBracketPicks();
      setPicks(r.picks);
    } catch { /* not logged in */ }
  }, [user, isAdmin]);

  useEffect(() => { loadEntries(); }, [loadEntries]);
  useEffect(() => { loadPicks();   }, [loadPicks]);

  const pickByEntry = useMemo(() => {
    const m = new Map<number, BracketPick>();
    picks.forEach(p => m.set(p.entryId, p));
    return m;
  }, [picks]);

  const windowByPhase = useMemo(() => {
    const m = new Map<number, BracketPhase>();
    windows.forEach(w => m.set(w.phase, w));
    return m;
  }, [windows]);

  const phases = useMemo(() => {
    const grouped: Record<number, BracketEntry[]> = { 1: [], 2: [] };
    entries.forEach(e => { (grouped[e.phase] ||= []).push(e); });
    return grouped;
  }, [entries]);

  const now = Date.now();

  async function submit(entry: BracketEntry) {
    if (!user)    { toast('Sign in first', 'Open Account to log in.'); return; }
    if (isAdmin)  { toast('Admin can\'t pick', 'Use a player account.'); return; }
    const pick = (drafts[entry.id] ?? pickByEntry.get(entry.id)?.pick ?? '').trim();
    if (!pick) { toast('No pick selected', 'Choose a team first.'); return; }
    setSavingId(entry.id);
    try {
      await api.saveBracketPick({ entryId: entry.id, pick });
      toast('✓ Saved', `Pick recorded: ${pick}`);
      setDrafts(d => { const c = { ...d }; delete c[entry.id]; return c; });
      await loadPicks();
    } catch (err) {
      toast('Error', (err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  if (isLoading) return null;

  return (
    <section>
      <div className="sh">
        <div className="sh-title">BRACKET</div>
        <div className="sh-sub">Free predictions — 3 pts per correct pick · no wallet cost</div>
      </div>

      {!user && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '12px 16px', marginBottom: '1.25rem', fontSize: 13, color: 'var(--off)',
        }}>
          You're not signed in — picks are read-only. <Link href="/account" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Sign in</Link> to submit.
        </div>
      )}

      {[1, 2].map(phase => {
        const win   = windowByPhase.get(phase) ?? null;
        const state = windowState(win?.startTime ?? null, win?.endTime ?? null, now);
        const phaseOpen = state === 'open';
        return (
          <div key={phase}>
            <div className="sh" style={{ paddingTop: '1.25rem', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div className="sh-title" style={{ fontSize: 22 }}>{PHASE_LABEL[phase]}</div>
              <span className={`st ${WINDOW_CLS[state]}`}>{WINDOW_STATE_LABEL[state]}</span>
            </div>

            <div style={{
              fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--off)',
              display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10,
            }}>
              <span>Opens: <strong style={{ color: 'var(--gold2)' }}>{formatLocal(win?.startTime)}</strong></span>
              <span>Closes: <strong style={{ color: 'var(--gold2)' }}>{formatLocal(win?.endTime)}</strong></span>
            </div>

            {(phases[phase] || []).length === 0 ? (
              <div className="empty-state" style={{ padding: '1.5rem' }}>
                <div className="ei" style={{ fontSize: 28 }}>🏟</div>
                <p>No bracket entries in this phase yet.</p>
              </div>
            ) : (
              <div className="matches-grid">
                {phases[phase].map(entry => {
                  const existing  = pickByEntry.get(entry.id);
                  const draft     = drafts[entry.id] ?? existing?.pick ?? '';
                  const isSettled = entry.status === 'settled';
                  const canEdit   = !!user && !isAdmin && phaseOpen && !isSettled;
                  const badge     = isSettled
                    ? { cls: 'st-done', text: '✓ SETTLED' }
                    : { cls: WINDOW_CLS[state], text: WINDOW_STATE_LABEL[state] };

                  return (
                    <div className="mc" key={entry.id}>
                      <div className="mc-top">
                        <span>3 pts</span>
                        <span className={`st ${badge.cls}`}>{badge.text}</span>
                      </div>
                      <div style={{ padding: '14px 14px 10px', fontFamily: 'var(--font-cond)', fontSize: 16, lineHeight: 1.4 }}>
                        {entry.label}
                      </div>

                      <div className="mc-preds">
                        <div className="prow">
                          <div className="popts" style={{ marginLeft: 0 }}>
                            {entry.teams.map(team => (
                              <button
                                key={team}
                                type="button"
                                className={`popt${draft === team ? ' sel' : ''}`}
                                disabled={!canEdit}
                                onClick={() => setDrafts(d => ({ ...d, [entry.id]: team }))}
                              >{team}</button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mc-wager" style={{ justifyContent: 'space-between' }}>
                        {existing
                          ? <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13 }}>
                              Your pick: <strong style={{ color: 'var(--gold2)' }}>{existing.pick}</strong>
                              {existing.outcome === 'win'  && <span style={{ color: '#2ecc71', marginLeft: 8 }}>+{existing.pointsAwarded} pts ✓</span>}
                              {existing.outcome === 'loss' && <span style={{ color: '#e74c3c', marginLeft: 8 }}>no points ✗</span>}
                            </div>
                          : <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--off)' }}>No pick yet</div>}

                        {!isSettled && (
                          <button
                            className="wsubmit"
                            disabled={!canEdit || savingId === entry.id}
                            onClick={() => submit(entry)}
                          >{
                            savingId === entry.id ? 'Saving…'
                            : state === 'scheduled' ? 'Opens later'
                            : state === 'closed'    ? 'Closed'
                            : state === 'unset'     ? 'Not open'
                            : existing ? 'Update'
                            : 'Submit'
                          }</button>
                        )}
                      </div>

                      {isSettled && entry.correctPick && (
                        <div style={{
                          borderTop: '1px solid var(--border)', padding: '8px 14px',
                          fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--off)',
                        }}>
                          Correct answer: <strong style={{ color: 'var(--mex2)' }}>{entry.correctPick}</strong>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
