'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  type BracketEntry,
  type BracketPick,
  type BracketRoundWindow,
  type GroupEntry,
  type GroupPick,
} from '@/lib/api';
import { formatLocal, windowState, WINDOW_STATE_LABEL, type WindowState } from '@/lib/time';
import { useAuth, useToast } from '../providers';

// ── Bracket tree constants ────────────────────────────────────────────────────
const TREE_ROUNDS = ['r32', 'r16', 'qf', 'sf', 'final'] as const;
type TreeRound = typeof TREE_ROUNDS[number];

const ROUND_LABEL: Record<string, string> = {
  r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', final: 'FINAL',
  third: '3RD PLACE', champion: 'CHAMPION',
};

const ENTRY_H  = 60;  // px — visual height of one match box
const ENTRY_GAP = 8;  // px — vertical gap between entries in the same round
const SLOT_H   = ENTRY_H + ENTRY_GAP; // logical slot height (entry + gap)
const CONN_W   = 20;  // px — connector gap between rounds
const ROUND_W  = 148; // px — width of each round column

const WINDOW_CLS: Record<WindowState, string> = {
  unset: 'st-up', scheduled: 'st-up', open: 'st-live', closed: 'st-up',
};

const POSITIONS = ['1st', '2nd', '3rd', '4th'];

// ── BkEntry — single match box in the bracket ────────────────────────────────
function BkEntry({
  entry,
  pick,
  projectedTeams,
  canPick,
  isSaving,
  onPick,
}: {
  entry: BracketEntry;
  pick: BracketPick | undefined;
  projectedTeams: [string?, string?] | undefined;
  canPick: boolean;
  isSaving: boolean;
  onPick: (team: string) => void;
}) {
  const isSettled = entry.status === 'settled';
  const hasOfficial = entry.teams.length >= 2;

  const display: { name: string; projected: boolean }[] = hasOfficial
    ? entry.teams.map(t => ({ name: t, projected: false }))
    : [
        { name: projectedTeams?.[0] ?? 'TBD', projected: !!projectedTeams?.[0] },
        { name: projectedTeams?.[1] ?? 'TBD', projected: !!projectedTeams?.[1] },
      ];

  const currentPick = pick?.pick ?? '';

  return (
    <div style={{
      width: ROUND_W,
      height: ENTRY_H,
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
    }}>
      {display.map((team, i) => {
        const isPicked   = !team.projected && currentPick === team.name;
        const isCorrect  = isSettled && entry.correctPick === team.name;
        const isWrong    = isSettled && isPicked && entry.correctPick !== team.name;
        const isClickable = canPick && !team.projected && team.name !== 'TBD';

        const bg    = isCorrect ? 'rgba(46,204,113,.18)'
                    : isPicked  ? 'rgba(255,190,0,.14)'
                    : 'transparent';
        const color = isCorrect ? '#2ecc71'
                    : isWrong   ? '#e74c3c'
                    : isPicked  ? 'var(--gold2)'
                    : team.projected ? 'rgba(255,255,255,.35)'
                    : 'var(--white)';

        return (
          <button
            key={i}
            disabled={!isClickable || isSaving}
            onClick={() => isClickable && onPick(team.name)}
            style={{
              flex: 1,
              width: '100%',
              padding: '0 8px',
              textAlign: 'left',
              background: bg,
              border: 'none',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
              color,
              fontFamily: 'var(--font-cond)',
              fontSize: 12,
              fontWeight: isPicked || isCorrect ? 700 : 400,
              fontStyle: team.projected ? 'italic' : 'normal',
              cursor: isClickable ? 'pointer' : 'default',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              transition: 'background .12s',
            }}
          >
            {isCorrect ? '✓ ' : isWrong ? '✗ ' : ''}{team.name}
          </button>
        );
      })}
    </div>
  );
}

// ── BracketTree — the full horizontal scroll tree ─────────────────────────────
function BracketTree({
  entries,
  pickByEntry,
  windowByRound,
  user,
  isAdmin,
  onPick,
  savingId,
}: {
  entries: BracketEntry[];
  pickByEntry: Map<number, BracketPick>;
  windowByRound: Map<string, BracketRoundWindow>;
  user: unknown;
  isAdmin: boolean;
  onPick: (entryId: number, team: string) => void;
  savingId: number | null;
}) {
  // Group + sort entries by round
  const byRound = useMemo(() => {
    const m: Partial<Record<string, BracketEntry[]>> = {};
    for (const e of entries) {
      if (!e.round) continue;
      if (!m[e.round]) m[e.round] = [];
      m[e.round]!.push(e);
    }
    for (const r of Object.keys(m)) {
      m[r]!.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return m;
  }, [entries]);

  // Only render rounds that have entries
  const activeTreeRounds = TREE_ROUNDS.filter(r => (byRound[r]?.length ?? 0) > 0);

  // Cascade preview: for each entry in rounds after the first, compute projected teams
  // from the user's picks in the previous round's feeder entries.
  const projectedTeams = useMemo((): Map<number, [string?, string?]> => {
    const proj = new Map<number, [string?, string?]>();
    for (let ri = 1; ri < activeTreeRounds.length; ri++) {
      const round     = activeTreeRounds[ri];
      const prevRound = activeTreeRounds[ri - 1];
      const roundEntries = byRound[round] ?? [];
      const prevEntries  = [...(byRound[prevRound] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
      for (const entry of roundEntries) {
        const feeder0 = prevEntries[entry.sortOrder * 2];
        const feeder1 = prevEntries[entry.sortOrder * 2 + 1];
        const p0 = feeder0 ? pickByEntry.get(feeder0.id)?.pick : undefined;
        const p1 = feeder1 ? pickByEntry.get(feeder1.id)?.pick : undefined;
        if (p0 !== undefined || p1 !== undefined) {
          proj.set(entry.id, [p0, p1]);
        }
      }
    }
    return proj;
  }, [activeTreeRounds, byRound, pickByEntry]);

  const now = Date.now();

  if (activeTreeRounds.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '1.5rem' }}>
        <div className="ei" style={{ fontSize: 28 }}>🏟</div>
        <p>No knockout entries yet.</p>
      </div>
    );
  }

  // Total bracket height = number of entries in the first active round × SLOT_H
  const firstRound  = activeTreeRounds[0];
  const firstCount  = byRound[firstRound]?.length ?? 1;
  const totalH      = firstCount * SLOT_H;

  return (
    <div style={{
      overflowX: 'auto',
      overflowY: 'visible',
      WebkitOverflowScrolling: 'touch' as never,
      overscrollBehaviorX: 'contain',
      scrollbarWidth: 'thin',
      scrollbarColor: 'var(--border) transparent',
      paddingBottom: 12,
      marginLeft: -4,
      marginRight: -4,
      paddingLeft: 4,
      paddingRight: 4,
    }}>
      {/* Round header labels row */}
      <div style={{
        display: 'flex',
        width: 'max-content',
        paddingLeft: 4,
        marginBottom: 6,
      }}>
        {activeTreeRounds.map((round, ri) => {
          const win   = windowByRound.get(round) ?? null;
          const state = windowState(win?.startTime ?? null, win?.endTime ?? null, now);
          return (
            <div key={round} style={{ width: ROUND_W + (ri < activeTreeRounds.length - 1 ? CONN_W : 0), flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, color: 'var(--gold2)', letterSpacing: '.5px' }}>
                  {ROUND_LABEL[round]}
                </span>
                <span className={`st ${WINDOW_CLS[state]}`} style={{ fontSize: 9, padding: '2px 5px' }}>
                  {state === 'open' ? '● OPEN' : state === 'closed' ? 'CLOSED' : state === 'scheduled' ? 'SOON' : '—'}
                </span>
              </div>
              {win && (
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 10, color: 'var(--off)', marginTop: 1 }}>
                  {state === 'open'
                    ? `Closes ${formatLocal(win.endTime, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                    : state === 'scheduled'
                    ? `Opens ${formatLocal(win.startTime, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                    : state === 'closed'
                    ? `Closed ${formatLocal(win.endTime, { month: 'short', day: 'numeric' })}`
                    : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tree */}
      <div style={{ display: 'flex', width: 'max-content', alignItems: 'flex-start' }}>
        {activeTreeRounds.map((round, ri) => {
          const roundEntries = byRound[round] ?? [];
          const isLastRound  = ri === activeTreeRounds.length - 1;
          const slotH        = SLOT_H * Math.pow(2, ri);
          const win          = windowByRound.get(round) ?? null;
          const state        = windowState(win?.startTime ?? null, win?.endTime ?? null, now);
          const isOpen       = state === 'open';
          const canPick      = !!user && !isAdmin && isOpen;

          return (
            <div key={round} style={{ display: 'flex', flexShrink: 0 }}>
              {/* Round column */}
              <div style={{ position: 'relative', width: ROUND_W, height: totalH, overflow: 'visible' }}>
                {roundEntries.map((entry, ei) => {
                  const slotTop   = ei * slotH;
                  const entryTop  = slotTop + (slotH - ENTRY_H) / 2;
                  const isUpper   = ei % 2 === 0;

                  return (
                    <div key={entry.id}>
                      {/* Entry box */}
                      <div style={{ position: 'absolute', top: entryTop, left: 0, width: ROUND_W }}>
                        <BkEntry
                          entry={entry}
                          pick={pickByEntry.get(entry.id)}
                          projectedTeams={projectedTeams.get(entry.id)}
                          canPick={canPick}
                          isSaving={savingId === entry.id}
                          onPick={(team) => onPick(entry.id, team)}
                        />
                      </div>

                      {/* Connector line to next round */}
                      {!isLastRound && (
                        <div style={{
                          position: 'absolute',
                          right: -CONN_W,
                          width: CONN_W,
                          top:    isUpper ? slotTop + slotH / 2 : slotTop,
                          height: slotH / 2,
                          borderTop:    isUpper ? '1px solid var(--border)' : 'none',
                          borderBottom: isUpper ? 'none' : '1px solid var(--border)',
                          borderRight:  '1px solid var(--border)',
                          boxSizing: 'border-box',
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Gap spacer for connectors */}
              {!isLastRound && <div style={{ width: CONN_W, flexShrink: 0 }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function BracketsPage() {
  const { user, isAdmin, isLoading } = useAuth();
  const { toast } = useToast();

  // Phase 1 — group standings
  const [groups,      setGroups]      = useState<GroupEntry[]>([]);
  const [groupPicks,  setGroupPicks]  = useState<GroupPick[]>([]);
  const [groupDrafts, setGroupDrafts] = useState<Record<number, string[]>>({});
  const [savingGid,   setSavingGid]   = useState<number | null>(null);

  // Phase 2 — knockout
  const [entries,       setEntries]       = useState<BracketEntry[]>([]);
  const [picks,         setPicks]         = useState<BracketPick[]>([]);
  const [savingId,      setSavingId]      = useState<number | null>(null);
  const [roundWindows,  setRoundWindows]  = useState<BracketRoundWindow[]>([]);

  // Phase 1 window (still from bracket_phases phase=1)
  const [phase1Win, setPhase1Win] = useState<{ startTime: string | null; endTime: string | null } | null>(null);

  // Special entries (third / champion) shown below tree
  const specialEntries = useMemo(
    () => entries.filter(e => e.round === 'third' || e.round === 'champion'),
    [entries],
  );

  const loadAll = useCallback(async () => {
    try {
      const [ge, be, bp, rw] = await Promise.all([
        api.groupEntries(),
        api.bracketEntries(),
        api.bracketPhases(),
        api.bracketRoundWindows(),
      ]);
      setGroups(ge.groups);
      setEntries(be.entries);
      setPhase1Win(bp.phases.find(p => p.phase === 1) ?? null);
      setRoundWindows(rw.windows);
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

  const windowByRound = useMemo(() => {
    const m = new Map<string, BracketRoundWindow>();
    roundWindows.forEach(w => m.set(w.round, w));
    return m;
  }, [roundWindows]);

  const now = Date.now();
  const phase1State = windowState(phase1Win?.startTime ?? null, phase1Win?.endTime ?? null, now);
  const phase1Open  = phase1State === 'open';

  // ── Group ranking submission ───────────────────────────────────────────
  function groupDraft(groupId: number, teams: string[]): string[] {
    if (groupDrafts[groupId]) return groupDrafts[groupId];
    const existing = groupPickById.get(groupId);
    if (existing) return existing.ranking.split('|');
    return ['', '', '', ''];
  }

  async function submitGroupPick(g: GroupEntry) {
    if (!user) { toast('Sign in first', 'Open Account to log in.'); return; }
    const teams   = g.teams.split('|');
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

  // ── Knockout pick — tap-to-submit ─────────────────────────────────────
  async function handleBracketPick(entryId: number, team: string) {
    if (!user) { toast('Sign in first', 'Open Account to log in.'); return; }
    setSavingId(entryId);
    try {
      await api.saveBracketPick({ entryId, pick: team });
      await loadPicks();
    } catch (err) {
      toast('Error', (err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  const selStyle = {
    background: '#1e1e2e', border: '1px solid var(--border)',
    color: 'var(--white)', fontFamily: 'var(--font-cond)', fontSize: 13,
    padding: '5px 8px', borderRadius: 5, cursor: 'pointer', width: '100%',
  };

  if (isLoading) return null;

  return (
    <section>
      <div className="sh">
        <div className="sh-title">BRACKET</div>
        <div className="sh-sub">Phase 1 · group standings — 1 pt per correct position · Phase 2 · knockout — 3 pts per correct pick</div>
      </div>

      {!user && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: '1.25rem', fontSize: 13, color: 'var(--off)' }}>
          You&apos;re not signed in — picks are read-only. <Link href="/account" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Sign in</Link> to submit.
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
                    const used      = draft.filter((_, j) => j !== i && draft[j]);
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
                  {!settled && (existing && !canEdit
                    ? null
                    : <div style={{ display: 'flex', gap: 8 }}>
                        {canEdit && draft.some(Boolean) && (
                          <button
                            className="wsubmit"
                            style={{ background: 'transparent', color: 'var(--off)', border: '1px solid var(--border)' }}
                            onClick={() => setGroupDrafts(d => ({ ...d, [g.id]: ['', '', '', ''] }))}
                          >Reset</button>
                        )}
                        <button className="wsubmit" disabled={!canEdit || savingGid === g.id} onClick={() => submitGroupPick(g)}>
                          {savingGid === g.id ? 'Saving…'
                            : phase1State === 'scheduled' ? 'Opens later'
                            : phase1State === 'closed'    ? 'Closed'
                            : phase1State === 'unset'     ? 'Not open'
                            : existing ? 'Update'
                            : 'Submit'}
                        </button>
                      </div>
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
      </div>

      {entries.filter(e => TREE_ROUNDS.includes(e.round as TreeRound)).length === 0 && specialEntries.length === 0 ? (
        <div className="empty-state" style={{ padding: '1.5rem' }}>
          <div className="ei" style={{ fontSize: 28 }}>🏟</div>
          <p>No knockout entries in this phase yet.</p>
        </div>
      ) : (
        <>
          {/* Hint for not-signed-in users */}
          {!user && (
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--off)', marginBottom: 10 }}>
              Tap a team to pick — <Link href="/account" style={{ color: 'var(--gold)' }}>sign in</Link> to save picks.
            </div>
          )}
          {user && !isAdmin && (
            <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--off)', marginBottom: 10 }}>
              Tap a team to submit your pick. Updates allowed while round is open. Scroll → to see later rounds.
            </div>
          )}

          <BracketTree
            entries={entries.filter(e => TREE_ROUNDS.includes(e.round as TreeRound))}
            pickByEntry={pickByEntry}
            windowByRound={windowByRound}
            user={user}
            isAdmin={isAdmin}
            onPick={handleBracketPick}
            savingId={savingId}
          />

          {/* ── Special entries: 3rd place + champion ───────────── */}
          {specialEntries.length > 0 && (
            <>
              <div style={{ height: 20 }} />
              <div className="matches-grid" style={{ gap: 10 }}>
                {specialEntries.map(entry => {
                  const existingPick = pickByEntry.get(entry.id);
                  const win          = windowByRound.get(entry.round) ?? null;
                  const state        = windowState(win?.startTime ?? null, win?.endTime ?? null, now);
                  const isOpen       = state === 'open';
                  const canPick      = !!user && !isAdmin && isOpen && entry.status !== 'settled';
                  const isSettled    = entry.status === 'settled';
                  const badge        = isSettled
                    ? { cls: 'st-done', text: '✓ SETTLED' }
                    : { cls: WINDOW_CLS[state], text: WINDOW_STATE_LABEL[state] };

                  return (
                    <div className="mc" key={entry.id}>
                      <div className="mc-top">
                        <span>{ROUND_LABEL[entry.round] ?? entry.round} · 3 pts</span>
                        <span className={`st ${badge.cls}`}>{badge.text}</span>
                      </div>
                      <div style={{ padding: '10px 14px 6px', fontFamily: 'var(--font-cond)', fontSize: 14, fontWeight: 700 }}>
                        {entry.label}
                      </div>
                      <div className="mc-preds">
                        <div className="prow">
                          <div className="popts" style={{ marginLeft: 0 }}>
                            {entry.teams.length > 0
                              ? entry.teams.map(team => {
                                  const picked   = existingPick?.pick === team;
                                  const correct  = isSettled && entry.correctPick === team;
                                  const wrong    = isSettled && picked && entry.correctPick !== team;
                                  return (
                                    <button
                                      key={team}
                                      type="button"
                                      className={`popt${picked ? ' sel' : ''}`}
                                      style={correct ? { background: 'rgba(46,204,113,.2)', color: '#2ecc71', borderColor: '#2ecc71' }
                                            : wrong   ? { color: '#e74c3c', opacity: .7 }
                                            : {}}
                                      disabled={!canPick}
                                      onClick={() => canPick && handleBracketPick(entry.id, team)}
                                    >{correct ? '✓ ' : wrong ? '✗ ' : ''}{team}</button>
                                  );
                                })
                              : <span style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--off)', padding: '6px 0' }}>Teams TBD</span>
                            }
                          </div>
                        </div>
                      </div>
                      <div className="mc-wager" style={{ justifyContent: 'space-between' }}>
                        {existingPick
                          ? <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13 }}>
                              Your pick: <strong style={{ color: 'var(--gold2)' }}>{existingPick.pick}</strong>
                              {existingPick.outcome === 'win'  && <span style={{ color: '#2ecc71', marginLeft: 8 }}>+{existingPick.pointsAwarded} pts ✓</span>}
                              {existingPick.outcome === 'loss' && <span style={{ color: '#e74c3c', marginLeft: 8 }}>no points ✗</span>}
                            </div>
                          : <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--off)' }}>No pick yet</div>
                        }
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
            </>
          )}
        </>
      )}
    </section>
  );
}
