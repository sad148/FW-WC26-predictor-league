'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type League, type Match, type PhaseWindow, type Question } from '@/lib/api';
import { localInputToUtc, utcToLocalInput } from '@/lib/time';
import { useAuth, useToast } from '../providers';

interface ResultDraft {
  scoreA:      string;
  scoreB:      string;
  firstScorer: string;   // '' = not set
  totalCards:  string;   // '' = not set
  startTime:   string;   // <input type="datetime-local"> value (local tz)
  endTime:     string;   // <input type="datetime-local"> value (local tz)
}
interface FixtureDraft {
  nameA: string; nameB: string;
  date: string; phase: 'group' | 'knockout'; group: string; venue: string;
  startTime: string; endTime: string;   // local tz datetime-local strings
}

const EMPTY_FIXTURE: FixtureDraft = {
  nameA: '', nameB: '', date: '', phase: 'group', group: '', venue: '',
  startTime: '', endTime: '',
};

interface NewQuestionDraft {
  text: string;
  phase: 1 | 2;
  pointValue: string;       // string for input field
  optionsRaw: string;       // comma-separated; empty = free-text
}

const EMPTY_QUESTION: NewQuestionDraft = { text: '', phase: 1, pointValue: '5', optionsRaw: '' };

interface QuestionDraft { winningAnswer: string; }
interface PhaseWindowDraft { startTime: string; endTime: string; }   // local-tz datetime-local strings

const PHASE_NAME: Record<number, string> = { 1: 'Phase 1 · Group Stage', 2: 'Phase 2 · Knockout' };

export default function AdminPage() {
  const { isAdmin, isLoading, refresh } = useAuth();
  const { toast } = useToast();
  const [league, setLeague]     = useState<League | null>(null);
  const [matches, setMatches]   = useState<Match[]>([]);
  const [drafts, setDrafts]     = useState<Record<number, ResultDraft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [newFix, setNewFix]     = useState<FixtureDraft>(EMPTY_FIXTURE);
  const [addingFix, setAdding]  = useState(false);
  const [name, setName] = useState('');
  const [adminPwd, setAdminPwd] = useState('');
  const [busy, setBusy] = useState(false);

  // Trivia (Subsystem B) state
  const [questions, setQuestions]     = useState<Question[]>([]);
  const [newQ, setNewQ]               = useState<NewQuestionDraft>(EMPTY_QUESTION);
  const [addingQ, setAddingQ]         = useState(false);
  const [qDrafts, setQDrafts]         = useState<Record<number, QuestionDraft>>({});
  const [savingQId, setSavingQId]     = useState<number | null>(null);
  const [phaseWindows, setPhaseWindows] = useState<PhaseWindow[]>([]);
  const [pwDrafts, setPwDrafts]         = useState<Record<number, PhaseWindowDraft>>({});
  const [savingPhase, setSavingPhase]   = useState<number | null>(null);

  const loadFixtures = useCallback(async () => {
    try {
      const r = await api.fixtures();
      setMatches(r.matches);
    } catch (e) { toast('Error', (e as Error).message); }
  }, [toast]);

  const loadQuestions = useCallback(async () => {
    try {
      const [q, p] = await Promise.all([api.questions(), api.questionPhases()]);
      setQuestions(q.questions);
      setPhaseWindows(p.phases);
    } catch (e) { toast('Error', (e as Error).message); }
  }, [toast]);

  useEffect(() => {
    if (!isAdmin) return;
    api.league().then(r => setLeague(r.league)).catch(() => {});
    loadFixtures();
    loadQuestions();
  }, [isAdmin, loadFixtures, loadQuestions]);

  function draftFor(m: Match): ResultDraft {
    return drafts[m.id] ?? {
      scoreA:      m.scoreA      == null ? '' : String(m.scoreA),
      scoreB:      m.scoreB      == null ? '' : String(m.scoreB),
      firstScorer: m.firstScorer ?? '',
      totalCards:  m.totalCards  == null ? '' : String(m.totalCards),
      startTime:   utcToLocalInput(m.startTime),
      endTime:     utcToLocalInput(m.endTime),
    };
  }

  function setResultDraft(m: Match, patch: Partial<ResultDraft>) {
    const base = draftFor(m);
    setDrafts(d => ({ ...d, [m.id]: { ...base, ...patch } }));
  }

  async function saveResult(m: Match) {
    const d = draftFor(m);
    setSavingId(m.id);
    try {
      const sA  = d.scoreA === '' ? '' : parseInt(d.scoreA);
      const sB  = d.scoreB === '' ? '' : parseInt(d.scoreB);
      const tc  = d.totalCards === '' ? '' : parseInt(d.totalCards);
      const fs  = d.firstScorer === '' ? null : d.firstScorer;
      const res = await api.updateFixture(m.id, {
        scoreA: sA,
        scoreB: sB,
        firstScorer: fs,
        totalCards:  tc,
        startTime:   localInputToUtc(d.startTime),
        endTime:     localInputToUtc(d.endTime),
      });
      toast('✓ Saved', `${m.teamA} vs ${m.teamB}${res.settled ? ` · ${res.settled} bet(s) settled` : ''}.`);
      await loadFixtures();
      setDrafts(prev => { const c = { ...prev }; delete c[m.id]; return c; });
    } catch (e) {
      toast('Error', (e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function addFixture() {
    if (!newFix.nameA.trim() || !newFix.nameB.trim()) {
      return toast('Missing fields', 'Enter both team names.');
    }
    setAdding(true);
    try {
      await api.addFixture({
        nameA: newFix.nameA.trim(),
        nameB: newFix.nameB.trim(),
        date:  newFix.date.trim() || undefined,
        phase: newFix.phase,
        groupName: newFix.group.trim() || null,
        venue: newFix.venue.trim() || undefined,
        startTime: localInputToUtc(newFix.startTime),
        endTime:   localInputToUtc(newFix.endTime),
      } as Parameters<typeof api.addFixture>[0]);
      toast('✓ Fixture added', `${newFix.nameA} vs ${newFix.nameB}`);
      setNewFix(EMPTY_FIXTURE);
      await loadFixtures();
    } catch (e) {
      toast('Error', (e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function addQuestion() {
    const text  = newQ.text.trim();
    const opts  = newQ.optionsRaw.split(',').map(s => s.trim()).filter(Boolean);
    const pts   = parseInt(newQ.pointValue, 10);
    if (!text)                       return toast('Missing fields', 'Enter question text.');
    if (!Number.isInteger(pts) || pts < 1) return toast('Invalid points', 'Point value must be a positive integer.');

    setAddingQ(true);
    try {
      await api.addQuestion({ text, phase: newQ.phase, pointValue: pts, options: opts.length > 0 ? opts : null });
      toast('✓ Question added', `Phase ${newQ.phase} · ${pts} pts`);
      setNewQ(EMPTY_QUESTION);
      await loadQuestions();
    } catch (e) {
      toast('Error', (e as Error).message);
    } finally {
      setAddingQ(false);
    }
  }

  function qDraftFor(q: Question): QuestionDraft {
    return qDrafts[q.id] ?? { winningAnswer: q.winningAnswer ?? '' };
  }
  function setQDraft(q: Question, patch: Partial<QuestionDraft>) {
    const base = qDraftFor(q);
    setQDrafts(d => ({ ...d, [q.id]: { ...base, ...patch } }));
  }

  // Settle a single question: record the winning answer and grade every answer to it.
  async function settleQuestion(q: Question) {
    const d = qDraftFor(q);
    const winningAnswer = d.winningAnswer.trim();
    if (!winningAnswer) return toast('Missing answer', 'Enter the winning answer before settling.');
    setSavingQId(q.id);
    try {
      const res = await api.updateQuestion(q.id, { winningAnswer, status: 'settled' });
      toast('✓ Settled', `${q.text.slice(0, 30)}${q.text.length > 30 ? '…' : ''}${res.settled ? ` · ${res.settled} answer(s) scored` : ''}`);
      await loadQuestions();
      setQDrafts(prev => { const c = { ...prev }; delete c[q.id]; return c; });
    } catch (e) {
      toast('Error', (e as Error).message);
    } finally {
      setSavingQId(null);
    }
  }

  // Per-phase answer window — a single open/close window shared by every question in the phase.
  function pwDraftFor(phase: number): PhaseWindowDraft {
    const w = phaseWindows.find(p => p.phase === phase);
    return pwDrafts[phase] ?? {
      startTime: utcToLocalInput(w?.startTime),
      endTime:   utcToLocalInput(w?.endTime),
    };
  }
  function setPwDraft(phase: number, patch: Partial<PhaseWindowDraft>) {
    const base = pwDraftFor(phase);
    setPwDrafts(d => ({ ...d, [phase]: { ...base, ...patch } }));
  }
  async function savePhaseWindow(phase: number) {
    const d = pwDraftFor(phase);
    setSavingPhase(phase);
    try {
      await api.setQuestionPhase({
        phase,
        startTime: localInputToUtc(d.startTime),
        endTime:   localInputToUtc(d.endTime),
      });
      toast('✓ Saved', `${PHASE_NAME[phase]} window updated.`);
      await loadQuestions();
      setPwDrafts(prev => { const c = { ...prev }; delete c[phase]; return c; });
    } catch (e) {
      toast('Error', (e as Error).message);
    } finally {
      setSavingPhase(null);
    }
  }

  async function createLeague() {
    if (!name.trim()) return toast('Missing fields', 'Enter a league name.');
    try {
      const res = await api.createLeague({ name: name.trim() });
      setLeague(res.league);
      setName('');
      toast('✓ League created', `Code: ${res.league.code}`);
    } catch (e) { toast('Error', (e as Error).message); }
  }

  async function seedFixtures() {
    if (!confirm('Bulk-load 8 sample WC2026 fixtures? Only works if fixtures table is empty.')) return;
    try {
      const res = await api.seedFixtures();
      toast('✓ Seeded', res.message);
    } catch (e) { toast('Error', (e as Error).message); }
  }

  async function reset() {
    if (!confirm('⚠ Truncate ALL tables (users, leagues, fixtures, bets, audit). Continue?')) return;
    try {
      const res = await api.adminReset();
      toast('✓ Reset', res.message);
      setLeague(null);
    } catch (e) { toast('Error', (e as Error).message); }
  }

  async function handleAdminLogin() {
    if (!adminPwd) return toast('Missing field', 'Enter the admin password.');
    setBusy(true);
    try {
      await api.adminLogin({ password: adminPwd });
      await refresh();
      setAdminPwd('');
      toast('✓ Admin', 'Logged in as admin.');
    } catch (e) {
      toast('Wrong password', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return null;

  if (!isAdmin) {
    return (
      <section>
        <div className="sh">
          <div className="sh-title">ADMIN</div>
          <div className="sh-sub">Admin login required.</div>
        </div>
        <div className="lform">
          <div className="lform-title" style={{ color: 'var(--can2)' }}>ADMIN LOGIN</div>
          <p style={{ color: 'var(--off)', fontSize: 13, lineHeight: 1.6, marginBottom: '1rem' }}>
            This area is restricted. Logging in here will end any active player session — admin and player accounts are separate.
          </p>
          <div className="fg">
            <label className="flabel">Password</label>
            <input
              className="finput"
              type="password"
              placeholder="Admin password"
              autoComplete="current-password"
              value={adminPwd}
              onChange={(e) => setAdminPwd(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdminLogin(); }}
            />
          </div>
          <button className="btn-gold" style={{ width: '100%' }} disabled={busy} onClick={handleAdminLogin}>
            {busy ? 'Logging in…' : 'Login →'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="sh"><div className="sh-title">ADMIN</div><div className="sh-sub">League + testing utilities</div></div>

      <div className="lform" style={{ marginBottom: '1.5rem' }}>
        <div className="lform-title" style={{ color: 'var(--gold)' }}>LEAGUE</div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: '1.25rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--gold)' }}>{league?.name || '—'}</div>
          <div style={{ fontFamily: "'Barlow Condensed',monospace", fontSize: 18, letterSpacing: 3, color: 'var(--gold2)', marginTop: 4 }}>
            {league?.code || 'No league yet.'}
          </div>
        </div>
        <div className="fg">
          <label className="flabel">New League Name</label>
          <input className="finput" placeholder="e.g. WC2026 Predictor" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn-gold" style={{ width: '100%' }} onClick={createLeague}>Create League →</button>
      </div>

      <div className="lform" style={{ marginBottom: '1.5rem', maxWidth: 'none' }}>
        <div className="lform-title" style={{ color: 'var(--gold)' }}>POST RESULTS</div>
        {matches.length === 0 ? (
          <p style={{ color: 'var(--off)', fontSize: 13 }}>No fixtures yet. Add one below or seed sample fixtures from Danger Zone.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {matches.map(m => {
              const d = draftFor(m);
              const cellInput = {
                background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)',
                color: 'var(--white)', fontFamily: 'var(--font-cond)', fontSize: 14, fontWeight: 700,
                padding: '4px 8px', borderRadius: 5, textAlign: 'center' as const,
              };
              const cellSelect = {
                background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)',
                color: 'var(--white)', fontFamily: 'var(--font-cond)', fontSize: 13,
                padding: '5px 8px', borderRadius: 5, cursor: 'pointer',
              };
              const subLabel = { fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--gold2)', letterSpacing: '.5px' };
              return (
                <div key={m.id} style={{
                  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '12px 14px',
                }}>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 14, fontWeight: 700 }}>
                      {m.flagA || '⚽'} {m.teamA} vs {m.teamB} {m.flagB || ''}
                    </div>
                    <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--off)', marginTop: 2 }}>
                      {m.date}{m.venue ? ` · ${m.venue}` : ''}
                    </div>
                  </div>

                  {/* Betting window — admin enters in their local tz; we convert to UTC on save. */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 10 }}>
                    <div>
                      <div style={subLabel}>BETTING OPENS (your local tz)</div>
                      <input
                        type="datetime-local"
                        value={d.startTime}
                        onChange={(e) => setResultDraft(m, { startTime: e.target.value })}
                        style={{ ...cellInput, width: '100%', marginTop: 3, textAlign: 'left' }}
                      />
                    </div>
                    <div>
                      <div style={subLabel}>BETTING CLOSES (your local tz)</div>
                      <input
                        type="datetime-local"
                        value={d.endTime}
                        onChange={(e) => setResultDraft(m, { endTime: e.target.value })}
                        style={{ ...cellInput, width: '100%', marginTop: 3, textAlign: 'left' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
                    <div>
                      <div style={subLabel}>SCORE (Q1 + Q3)</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <input
                          type="number" min={0} placeholder="A"
                          value={d.scoreA}
                          onChange={(e) => setResultDraft(m, { scoreA: e.target.value })}
                          style={{ ...cellInput, width: 50 }}
                        />
                        <span style={{ color: 'var(--off)', fontFamily: 'var(--font-cond)', fontWeight: 700 }}>–</span>
                        <input
                          type="number" min={0} placeholder="B"
                          value={d.scoreB}
                          onChange={(e) => setResultDraft(m, { scoreB: e.target.value })}
                          style={{ ...cellInput, width: 50 }}
                        />
                      </div>
                    </div>

                    <div>
                      <div style={subLabel}>FIRST SCORER (Q2)</div>
                      <select
                        value={d.firstScorer}
                        onChange={(e) => setResultDraft(m, { firstScorer: e.target.value })}
                        style={{ ...cellSelect, marginTop: 3, width: '100%' }}
                      >
                        <option value="">— not set —</option>
                        <option value={m.teamA}>{m.teamA}</option>
                        <option value={m.teamB}>{m.teamB}</option>
                        <option value="No Goal">No Goal</option>
                      </select>
                    </div>

                    <div>
                      <div style={subLabel}>TOTAL CARDS (Q4)</div>
                      <input
                        type="number" min={0} placeholder="—"
                        value={d.totalCards}
                        onChange={(e) => setResultDraft(m, { totalCards: e.target.value })}
                        style={{ ...cellInput, width: '100%', marginTop: 3 }}
                      />
                    </div>

                    <button
                      className="wsubmit"
                      style={{ marginLeft: 0 }}
                      disabled={savingId === m.id}
                      onClick={() => saveResult(m)}
                    >{savingId === m.id ? 'Saving…' : 'Save'}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="lform" style={{ marginBottom: '1.5rem' }}>
        <div className="lform-title" style={{ color: 'var(--mex2)' }}>ADD FIXTURE</div>
        <div className="fg"><label className="flabel">Team A</label>
          <input className="finput" placeholder="e.g. Brazil"
                 value={newFix.nameA}
                 onChange={(e) => setNewFix({ ...newFix, nameA: e.target.value })} />
        </div>
        <div className="fg"><label className="flabel">Team B</label>
          <input className="finput" placeholder="e.g. Germany"
                 value={newFix.nameB}
                 onChange={(e) => setNewFix({ ...newFix, nameB: e.target.value })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="fg"><label className="flabel">Date</label>
            <input className="finput" placeholder="Jun 15"
                   value={newFix.date}
                   onChange={(e) => setNewFix({ ...newFix, date: e.target.value })} />
          </div>
          <div className="fg"><label className="flabel">Phase</label>
            <select
              className="finput"
              style={{ cursor: 'pointer' }}
              value={newFix.phase}
              onChange={(e) => setNewFix({ ...newFix, phase: e.target.value as 'group' | 'knockout' })}
            >
              <option value="group">Group Stage</option>
              <option value="knockout">Knockout</option>
            </select>
          </div>
        </div>
        <div className="fg"><label className="flabel">Group / Round</label>
          <input className="finput" placeholder="A, B, R16, QF…"
                 value={newFix.group}
                 onChange={(e) => setNewFix({ ...newFix, group: e.target.value })} />
        </div>
        <div className="fg"><label className="flabel">Venue</label>
          <input className="finput" placeholder="e.g. MetLife Stadium, NJ"
                 value={newFix.venue}
                 onChange={(e) => setNewFix({ ...newFix, venue: e.target.value })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="fg"><label className="flabel">Betting Opens (your local tz)</label>
            <input className="finput" type="datetime-local"
                   value={newFix.startTime}
                   onChange={(e) => setNewFix({ ...newFix, startTime: e.target.value })} />
          </div>
          <div className="fg"><label className="flabel">Betting Closes (your local tz)</label>
            <input className="finput" type="datetime-local"
                   value={newFix.endTime}
                   onChange={(e) => setNewFix({ ...newFix, endTime: e.target.value })} />
          </div>
        </div>
        <button className="btn-gold" style={{ width: '100%' }} disabled={addingFix} onClick={addFixture}>
          {addingFix ? 'Adding…' : 'Add Fixture'}
        </button>
      </div>

      {/* ─── Trivia (Subsystem B): per-phase answer windows ─── */}
      <div className="lform" style={{ marginBottom: '1.5rem', maxWidth: 'none' }}>
        <div className="lform-title" style={{ color: 'var(--gold)' }}>TRIVIA — PHASE WINDOWS</div>
        <p style={{ color: 'var(--off)', fontSize: 13, lineHeight: 1.6, marginBottom: '1rem' }}>
          One open/close window per phase, shared by every question in it. Players can answer a phase's
          questions only while now is inside its window. Enter times in your local timezone; stored as UTC.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {[1, 2].map(phase => {
            const d = pwDraftFor(phase);
            const subLabel = { fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--gold2)', letterSpacing: '.5px' };
            const cellInput = {
              background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)',
              color: 'var(--white)', fontFamily: 'var(--font-cond)', fontSize: 14,
              padding: '4px 8px', borderRadius: 5,
            };
            return (
              <div key={phase} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontFamily: 'var(--font-cond)', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
                  {PHASE_NAME[phase]}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
                  <div>
                    <div style={subLabel}>OPENS (your local tz)</div>
                    <input
                      type="datetime-local"
                      value={d.startTime}
                      onChange={(e) => setPwDraft(phase, { startTime: e.target.value })}
                      style={{ ...cellInput, width: '100%', marginTop: 3 }}
                    />
                  </div>
                  <div>
                    <div style={subLabel}>CLOSES (your local tz)</div>
                    <input
                      type="datetime-local"
                      value={d.endTime}
                      onChange={(e) => setPwDraft(phase, { endTime: e.target.value })}
                      style={{ ...cellInput, width: '100%', marginTop: 3 }}
                    />
                  </div>
                  <button
                    className="wsubmit"
                    style={{ marginLeft: 0 }}
                    disabled={savingPhase === phase}
                    onClick={() => savePhaseWindow(phase)}
                  >{savingPhase === phase ? 'Saving…' : 'Save Window'}</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Trivia (Subsystem B): per-question settling ─── */}
      <div className="lform" style={{ marginBottom: '1.5rem', maxWidth: 'none' }}>
        <div className="lform-title" style={{ color: 'var(--gold)' }}>TRIVIA — SETTLE</div>
        {questions.length === 0 ? (
          <p style={{ color: 'var(--off)', fontSize: 13 }}>No questions yet. Add one below.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {questions.map(q => {
              const d = qDraftFor(q);
              return (
                <div key={q.id} style={{
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 14, fontWeight: 700 }}>
                        {q.text}
                      </div>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--off)', marginTop: 2 }}>
                        Phase {q.phase} · {q.pointValue} pt{q.pointValue === 1 ? '' : 's'}
                        {q.options ? ` · options: ${q.options.join(', ')}` : ' · free-text'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, alignItems: 'end' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--gold2)', letterSpacing: '.5px', marginBottom: 3 }}>WINNING ANSWER</div>
                      {q.options
                        ? <select
                            value={d.winningAnswer}
                            onChange={(e) => setQDraft(q, { winningAnswer: e.target.value })}
                            style={{
                              background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)',
                              color: 'var(--white)', fontFamily: 'var(--font-cond)', fontSize: 13,
                              padding: '5px 8px', borderRadius: 5, cursor: 'pointer', width: '100%',
                            }}
                          >
                            <option value="">— not set —</option>
                            {q.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        : <input
                            type="text"
                            placeholder="exact answer"
                            value={d.winningAnswer}
                            onChange={(e) => setQDraft(q, { winningAnswer: e.target.value })}
                            style={{
                              background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)',
                              color: 'var(--white)', fontFamily: 'var(--font-cond)', fontSize: 13,
                              padding: '5px 8px', borderRadius: 5, width: '100%',
                            }}
                          />}
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, color: 'var(--gold2)', letterSpacing: '.5px', marginBottom: 3 }}>STATUS</div>
                      <div style={{
                        fontFamily: 'var(--font-cond)', fontSize: 13, fontWeight: 700, padding: '5px 0',
                        color: q.status === 'settled' ? '#2ecc71' : 'var(--off)',
                      }}>
                        {q.status === 'settled' ? '✓ Settled' : 'Awaiting result'}
                      </div>
                    </div>
                    <button
                      className="wsubmit"
                      style={{ marginLeft: 0, alignSelf: 'end' }}
                      disabled={savingQId === q.id}
                      onClick={() => settleQuestion(q)}
                    >{savingQId === q.id ? 'Saving…' : q.status === 'settled' ? 'Re-score' : 'Settle & Score'}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="lform" style={{ marginBottom: '1.5rem' }}>
        <div className="lform-title" style={{ color: 'var(--mex2)' }}>ADD TRIVIA QUESTION</div>
        <div className="fg"><label className="flabel">Question Text</label>
          <input className="finput" placeholder="e.g. Top scoring group-stage team?"
                 value={newQ.text} onChange={(e) => setNewQ({ ...newQ, text: e.target.value })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="fg"><label className="flabel">Phase</label>
            <select className="finput" style={{ cursor: 'pointer' }}
                    value={newQ.phase}
                    onChange={(e) => setNewQ({ ...newQ, phase: Number(e.target.value) as 1 | 2 })}>
              <option value={1}>Phase 1 (Group Stage)</option>
              <option value={2}>Phase 2 (Knockout)</option>
            </select>
          </div>
          <div className="fg"><label className="flabel">Point Value</label>
            <input className="finput" type="number" min={1}
                   value={newQ.pointValue}
                   onChange={(e) => setNewQ({ ...newQ, pointValue: e.target.value })} />
          </div>
        </div>
        <div className="fg"><label className="flabel">Options (comma-separated, leave blank for free-text)</label>
          <input className="finput" placeholder="e.g. Brazil, Argentina, France, Germany"
                 value={newQ.optionsRaw}
                 onChange={(e) => setNewQ({ ...newQ, optionsRaw: e.target.value })} />
        </div>
        <button className="btn-gold" style={{ width: '100%' }} disabled={addingQ} onClick={addQuestion}>
          {addingQ ? 'Adding…' : 'Add Question'}
        </button>
      </div>

      <div className="lform">
        <div className="lform-title" style={{ color: 'var(--can2)' }}>DANGER ZONE</div>
        <p style={{ color: 'var(--off)', fontSize: 13, lineHeight: 1.6, marginBottom: '1rem' }}>
          Testing-phase utilities. Both are destructive.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-outline" onClick={seedFixtures}>📋 Seed Sample Fixtures</button>
          <button
            className="btn-outline"
            style={{ borderColor: 'var(--can)', color: 'var(--can2)' }}
            onClick={reset}
          >⚠ Reset All Data</button>
        </div>
      </div>
    </section>
  );
}
