'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type BracketEntry, type BracketPhase, type BracketPick, type GroupEntry, type GroupPick } from '@/lib/api';
import { formatLocal, windowState, WINDOW_STATE_LABEL, type WindowState } from '@/lib/time';
import { useAuth, useToast } from '../providers';

const WINDOW_CLS: Record<WindowState, string> = {
  unset:     'st-up',
  scheduled: 'st-up',
  open:      'st-live',
  closed:    'st-up',
};

const POSITIONS = ['1st', '2nd', '3rd', '4th'];

export default function BracketsPage() {
  const { user, isAdmin, isLoading } = useAuth();
  const { toast } = useToast();

  // Phase 1 — group standings
  const [groups,      setGroups]      = useState<GroupEntry[]>([]);
  const [groupPicks,  setGroupPicks]  = useState<GroupPick[]>([]);
  const [groupDrafts, setGroupDrafts] = useState<Record<number, string[]>>({}); // groupId → [1st,2nd,3rd,4th]
  const [savingGid,   setSavingGid]   = useState<number | null>(null);

  // Phase 2 — knockout
  const [entries,  setEntries]  = useState<BracketEntry[]>([]);
  const [picks,    setPicks]    = useState<BracketPick[]>([]);
  const [drafts,   setDrafts]   = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  // Shared
  const [windows, setWindows] = useState<BracketPhase[]>([]);

  const loadAll = useCallback(async () => {
    try {
      const [g, e, p] = await Promise.all([api.groupEntries(), api.bracketEntries(), api.bracketPhases()]);
      setGroups(g.groups);
      setEntries(e.entries);
      setWindows(p.phases);
    } catch (err) { toast('Error', (err as Error).message); }
  }, [toast]);

  const loadPicks = useCallback(async () => {
    if (!user || isAdmin) { setGroupPicks([]); setPicks([]); return; }
    try {
      const [gp, bp] = await Promise.all([api.myGroupPicks(), api.myBracketPicks()]);
      setGroupPicks(gp.picks);
      setPicks(bp.picks);
    } catch { /* not logged in */ }
  }, [user, isAdmin]);

  useEffect(() => { loadAll(); },  [loadAll]);
  useEffect(() => { loadPicks(); }, [loadPicks]);

  const pickByEntry = useMemo(() => {
    const m = new Map<number, BracketPick>();
    picks.forEach(p => m.set(p.entryId, p));
    return m;
  }, [picks]);

  const groupPickById = useMemo(() => {
    const m = new Map<number, GroupPick>();
    groupPicks.forEach(p => m.set(p.groupId, p));
    return m;
  }, [groupPicks]);

  const windowByPhase = useMemo(() => {
    const m = new Map<number, BracketPhase>();
    windows.forEach(w => m.set(w.phase, w));
    return m;
  }, [windows]);

  const now = Date.now();
  const phase1Win   = windowByPhase.get(1) ?? null;
  const phase1State = windowState(phase1Win?.startTime ?? null, phase1Win?.endTime ?? null, now);
  const phase1Open  = phase1State === 'open';
  const phase2Win   = windowByPhase.get(2) ?? null;
  const phase2State = windowState(phase2Win?.startTime ?? null, phase2Win?.endTime ?? null, now);
  const phase2Open  = phase2State === 'open';

  // ── Group ranking submission ───────────────────────────────────────────
  function groupDraft(groupId: number, teams: string[]): string[] {
    if (groupDrafts[groupId]) return groupDrafts[groupId];
    const existing = groupPickById.get(groupId);
    if (existing) return existing.ranking.split('|');
    return ['', '', '', ''];
  }

  async function submitGroupPick(g: GroupEntry) {
    if (!user) { toast('Sign in first', 'Open Account to log in.'); return; }
    const teams = g.teams.split('|');
    const ranking = groupDraft(g.id, teams);
    if (ranking.some(r => !r)) { toast('Incomplete', 'Fill all 4 positions before submitting.'); return; }
    setSavingGid(g.id);
    try {
      await api.saveGroupPick({ groupId: g.id, ranking: ranking.join('|') });
      toast('✓ Saved', `Group ${g.groupName} ranking submitted.`);
      setGroupDrafts(d => { const c = { ...d }; delete c[g.id]; return c; });
      await loadPicks();
    } catch (err) {
      toast('Error', (err as Error).message);
    } finally {
      setSavingGid(null);
    }
  }

  // ── Knockout pick submission ───────────────────────────────────────────
  async function submitKnockoutPick(entry: BracketEntry) {
    if (!user) { toast('Sign in first', 'Open Account to log in.'); return; }
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

  const selStyle = {
    background: '#1e1e2e', border: '1px solid var(--border)',
    color: 'var(--white)', fontFamily: 'var(--font-cond)', fontSize: 13,
    padding: '5px 8px', borderRadius: 5, cursor: 'pointer', width: '100%',
  };

  return (
    <section>
      <div className="sh">
        <div className="sh-title">BRACKET</div>
        <div className="sh-sub">Phase 1 · group standings — 1 pt per correct position · Phase 2 · knockout — 3 pts per correct pick</div>
      </div>

      {!user && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: '1.25rem', fontSize: 13, color: 'var(--off)' }}>
          You're not signed in — picks are read-only. <Link href="/account" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Sign in</Link> to submit.
        </div>
      )}

      {/* ── Phase 1: Group Standings ──────────────────────────────── */}
      <div className="sh" style={{ paddingTop: '1.25rem', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div className="sh-title" style={{ fontSize: 22 }}>PHASE 1 · GROUP STANDINGS</div>
        <span className={`st ${WINDOW_CLS[phase1State]}`}>{WINDOW_STATE_LABEL[phase1State]}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--off)', display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
        <span>Opens: <strong style={{ color: 'var(--gold2)' }}>{formatLocal(phase1Win?.startTime)}</strong></span>
        <span>Closes: <strong style={{ color: 'var(--gold2)' }}>{formatLocal(phase1Win?.endTime)}</strong></span>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state" style={{ padding: '1.5rem' }}>
          <div className="ei" style={{ fontSize: 28 }}>🏟</div>
          <p>No groups set up yet.</p>
        </div>
      ) : (
        <div className="matches-grid-3">
          {groups.map(g => {
            const teams    = g.teams.split('|');
            const draft    = groupDraft(g.id, teams);
            const existing = groupPickById.get(g.id);
            const settled  = g.status === 'settled';
            const canEdit  = !!user && !isAdmin && phase1Open && !settled;
            const badge    = settled
              ? { cls: 'st-done', text: '✓ SETTLED' }
              : { cls: WINDOW_CLS[phase1State], text: WINDOW_STATE_LABEL[phase1State] };

            return (
              <div className="mc" key={g.id}>
                <div className="mc-top">
                  <span>1 pt / position</span>
                  <span className={`st ${badge.cls}`}>{badge.text}</span>
                </div>
                <div style={{ padding: '14px 14px 10px', fontFamily: 'var(--font-cond)', fontSize: 16, fontWeight: 700 }}>
                  Group {g.groupName}
                </div>

                <div className="mc-preds">
                  {POSITIONS.map((pos, i) => {
                    const used = draft.filter((_, j) => j !== i && draft[j]);
                    const available = teams.filter(t => !used.includes(t));
                    return (
                      <div key={pos} className="prow" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px' }}>
                        <span style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--gold2)', width: 28, flexShrink: 0 }}>{pos}</span>
                        <select
                          style={{ ...selStyle, opacity: canEdit ? 1 : 0.6 }}
                          disabled={!canEdit}
                          value={draft[i]}
                          onChange={e => {
                            const next = [...draft];
                            next[i] = e.target.value;
                            setGroupDrafts(d => ({ ...d, [g.id]: next }));
                          }}
                        >
                          <option value="">— pick team —</option>
                          {available.map(t => <option key={t} value={t}>{t}</option>)}
                          {draft[i] && <option value={draft[i]}>{draft[i]}</option>}
                        </select>
                      </div>
                    );
                  })}
                </div>

                <div className="mc-wager" style={{ justifyContent: 'space-between' }}>
                  {existing ? (
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13 }}>
                      Your pick: <strong style={{ color: 'var(--gold2)' }}>{existing.ranking.split('|').join(' › ')}</strong>
                      {settled && existing.pointsAwarded > 0 && <span style={{ color: '#2ecc71', marginLeft: 8 }}>+{existing.pointsAwarded} pts</span>}
                      {settled && existing.pointsAwarded === 0 && <span style={{ color: '#e74c3c', marginLeft: 8 }}>0 pts</span>}
                    </div>
                  ) : (
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--off)' }}>No pick yet</div>
                  )}
                  {!settled && (
                    <button className="wsubmit" disabled={!canEdit || savingGid === g.id} onClick={() => submitGroupPick(g)}>
                      {savingGid === g.id ? 'Saving…'
                        : phase1State === 'scheduled' ? 'Opens later'
                        : phase1State === 'closed'    ? 'Closed'
                        : phase1State === 'unset'     ? 'Not open'
                        : existing ? 'Update' : 'Submit'}
                    </button>
                  )}
                </div>

                {settled && g.correctRanking && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '8px 14px', fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--off)' }}>
                    Final standings: <strong style={{ color: 'var(--mex2)' }}>{g.correctRanking.split('|').join(' › ')}</strong>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Phase 2: Knockout Tree ────────────────────────────────── */}
      <div className="sh" style={{ paddingTop: '1.25rem', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div className="sh-title" style={{ fontSize: 22 }}>PHASE 2 · KNOCKOUT TREE</div>
        <span className={`st ${WINDOW_CLS[phase2State]}`}>{WINDOW_STATE_LABEL[phase2State]}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--off)', display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
        <span>Opens: <strong style={{ color: 'var(--gold2)' }}>{formatLocal(phase2Win?.startTime)}</strong></span>
        <span>Closes: <strong style={{ color: 'var(--gold2)' }}>{formatLocal(phase2Win?.endTime)}</strong></span>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state" style={{ padding: '1.5rem' }}>
          <div className="ei" style={{ fontSize: 28 }}>🏟</div>
          <p>No knockout entries in this phase yet.</p>
        </div>
      ) : (
        <div className="matches-grid">
          {entries.map(entry => {
            const existing  = pickByEntry.get(entry.id);
            const draft     = drafts[entry.id] ?? existing?.pick ?? '';
            const isSettled = entry.status === 'settled';
            const canEdit   = !!user && !isAdmin && phase2Open && !isSettled;
            const badge     = isSettled
              ? { cls: 'st-done', text: '✓ SETTLED' }
              : { cls: WINDOW_CLS[phase2State], text: WINDOW_STATE_LABEL[phase2State] };

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
                        <button key={team} type="button"
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
                    <button className="wsubmit" disabled={!canEdit || savingId === entry.id} onClick={() => submitKnockoutPick(entry)}>
                      {savingId === entry.id ? 'Saving…'
                        : phase2State === 'scheduled' ? 'Opens later'
                        : phase2State === 'closed'    ? 'Closed'
                        : phase2State === 'unset'     ? 'Not open'
                        : existing ? 'Update' : 'Submit'}
                    </button>
                  )}
                </div>
                {isSettled && entry.correctPick && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '8px 14px', fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--off)' }}>
                    Correct answer: <strong style={{ color: 'var(--mex2)' }}>{entry.correctPick}</strong>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
