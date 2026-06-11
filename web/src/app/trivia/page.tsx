'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Answer, type PhaseWindow, type Question } from '@/lib/api';
import { formatLocal, windowState, WINDOW_STATE_LABEL, type WindowState } from '@/lib/time';
import { useAuth, useToast } from '../providers';

const PHASE_LABEL: Record<number, string> = { 1: 'PHASE 1 · GROUP STAGE', 2: 'PHASE 2 · KNOCKOUT' };

// Per-question badge: a settled question always shows "settled"; otherwise it inherits
// its phase's window state (open/closed/scheduled), since open/close is now phase-level.
const WINDOW_CLS: Record<WindowState, string> = {
  unset:     'st-up',
  scheduled: 'st-up',
  open:      'st-live',
  closed:    'st-up',
};

export default function TriviaPage() {
  const { user, isAdmin, isLoading } = useAuth();
  const { toast } = useToast();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers,   setAnswers]   = useState<Answer[]>([]);
  const [windows,   setWindows]   = useState<PhaseWindow[]>([]);
  const [drafts,    setDrafts]    = useState<Record<number, string>>({});
  const [savingId,  setSavingId]  = useState<number | null>(null);

  const loadQuestions = useCallback(async () => {
    try {
      const [q, p] = await Promise.all([api.questions(), api.questionPhases()]);
      setQuestions(q.questions);
      setWindows(p.phases);
    } catch (e) { toast('Error', (e as Error).message); }
  }, [toast]);

  const loadAnswers = useCallback(async () => {
    if (!user || isAdmin) { setAnswers([]); return; }
    try {
      const r = await api.myAnswers();
      setAnswers(r.answers);
    } catch { /* not logged in, ignore */ }
  }, [user, isAdmin]);

  useEffect(() => { loadQuestions(); }, [loadQuestions]);
  useEffect(() => { loadAnswers();   }, [loadAnswers]);

  const answerByQuestion = useMemo(() => {
    const m = new Map<number, Answer>();
    answers.forEach(a => m.set(a.questionId, a));
    return m;
  }, [answers]);

  const windowByPhase = useMemo(() => {
    const m = new Map<number, PhaseWindow>();
    windows.forEach(w => m.set(w.phase, w));
    return m;
  }, [windows]);

  const phases = useMemo(() => {
    const grouped: Record<number, Question[]> = { 1: [], 2: [] };
    questions.forEach(q => { (grouped[q.phase] ||= []).push(q); });
    return grouped;
  }, [questions]);

  // Rebind 'now' once per render — enough to flip a phase open→closed on reload.
  const now = Date.now();

  async function submit(q: Question) {
    if (!user) { toast('Sign in first', 'Open Account to log in.'); return; }
    if (isAdmin) { toast('Admin can\'t answer', 'Use a player account.'); return; }
    const answer = (drafts[q.id] ?? answerByQuestion.get(q.id)?.answer ?? '').trim();
    if (!answer) { toast('Empty answer', 'Pick or type an answer first.'); return; }
    setSavingId(q.id);
    try {
      await api.saveAnswer({ questionId: q.id, answer });
      toast('✓ Saved', `Answer recorded for "${q.text.slice(0, 40)}${q.text.length > 40 ? '…' : ''}"`);
      setDrafts(d => { const c = { ...d }; delete c[q.id]; return c; });
      await loadAnswers();
    } catch (e) {
      toast('Error', (e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  if (isLoading) return null;

  return (
    <section>
      <div className="sh">
        <div className="sh-title">TRIVIA</div>
        <div className="sh-sub">Free predictions — no wallet cost · points per question vary</div>
      </div>

      {!user && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '12px 16px', marginBottom: '1.25rem', fontSize: 13, color: 'var(--off)',
        }}>
          You're not signed in — answers are read-only. <Link href="/account" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Sign in</Link> to submit.
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

            {/* Single answer window for the whole phase, shown in the user's local tz. */}
            <div style={{
              fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--off)',
              display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10,
            }}>
              <span>Opens: <strong style={{ color: 'var(--gold2)' }}>{formatLocal(win?.startTime)}</strong></span>
              <span>Closes: <strong style={{ color: 'var(--gold2)' }}>{formatLocal(win?.endTime)}</strong></span>
            </div>

            {(phases[phase] || []).length === 0 ? (
              <div className="empty-state" style={{ padding: '1.5rem' }}>
                <div className="ei" style={{ fontSize: 28 }}>📭</div>
                <p>No questions in this phase yet.</p>
              </div>
            ) : (
              <div className="matches-grid">
                {phases[phase].map(q => {
                  const existing  = answerByQuestion.get(q.id);
                  const draft     = drafts[q.id] ?? existing?.answer ?? '';
                  const isSettled = q.status === 'settled';
                  const canEdit   = !!user && !isAdmin && phaseOpen && !isSettled;
                  const badge     = isSettled
                    ? { cls: 'st-done', text: '✓ SETTLED' }
                    : { cls: WINDOW_CLS[state], text: WINDOW_STATE_LABEL[state] };

                  return (
                    <div className="mc" key={q.id}>
                      <div className="mc-top">
                        <span>{q.pointValue} pt{q.pointValue === 1 ? '' : 's'}</span>
                        <span className={`st ${badge.cls}`}>{badge.text}</span>
                      </div>
                      <div style={{ padding: '14px 14px 10px', fontFamily: 'var(--font-cond)', fontSize: 16, lineHeight: 1.4 }}>
                        {q.text}
                      </div>

                      {/* Answer area */}
                      <div className="mc-preds">
                        {q.questionType === 'comma-teams' ? (
                          <div style={{ padding: '8px 14px 4px' }}>
                            <div style={{
                              fontFamily: 'var(--font-cond)', fontSize: 12,
                              color: 'var(--gold2)', marginBottom: 6,
                            }}>
                              Enter {q.maxSelections ? `exactly ${q.maxSelections}` : 'the'} team names separated by commas
                              {q.maxSelections ? ` (e.g. France, Germany, Brazil…)` : ''}
                            </div>
                            <input
                              className="finput"
                              type="text"
                              placeholder={q.maxSelections ? `Team 1, Team 2, … (${q.maxSelections} total)` : 'France, Germany, Brazil…'}
                              value={draft}
                              disabled={!canEdit}
                              onChange={(e) => setDrafts(d => ({ ...d, [q.id]: e.target.value }))}
                            />
                          </div>
                        ) : q.options
                          ? <div className="prow">
                              <div className="popts" style={{ marginLeft: 0 }}>
                                {q.options.map(opt => (
                                  <button
                                    key={opt}
                                    type="button"
                                    className={`popt${draft === opt ? ' sel' : ''}`}
                                    disabled={!canEdit}
                                    onClick={() => setDrafts(d => ({ ...d, [q.id]: opt }))}
                                  >{opt}</button>
                                ))}
                              </div>
                            </div>
                          : <input
                              className="finput"
                              type="text"
                              placeholder="Type your answer…"
                              value={draft}
                              disabled={!canEdit}
                              onChange={(e) => setDrafts(d => ({ ...d, [q.id]: e.target.value }))}
                            />}
                      </div>

                      <div className="mc-wager" style={{ justifyContent: 'space-between' }}>
                        {existing
                          ? <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13 }}>
                              Your pick: <strong style={{ color: 'var(--gold2)' }}>{existing.answer}</strong>
                              {existing.outcome === 'win'  && <span style={{ color: '#2ecc71', marginLeft: 8 }}>+{existing.pointsAwarded} pts ✓</span>}
                              {existing.outcome === 'loss' && <span style={{ color: '#e74c3c', marginLeft: 8 }}>no points ✗</span>}
                            </div>
                          : <div style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--off)' }}>No answer yet</div>}

                        {!isSettled && (
                          <button
                            className="wsubmit"
                            disabled={!canEdit || savingId === q.id}
                            onClick={() => submit(q)}
                          >{
                            savingId === q.id ? 'Saving…'
                            : state === 'scheduled' ? 'Opens later'
                            : state === 'closed'    ? 'Closed'
                            : state === 'unset'     ? 'Not open'
                            : existing ? 'Update'
                            : 'Submit'
                          }</button>
                        )}
                      </div>

                      {/* Show correct answer when settled */}
                      {isSettled && q.winningAnswer && (
                        <div style={{
                          borderTop: '1px solid var(--border)', padding: '8px 14px',
                          fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--off)',
                        }}>
                          Correct answer: <strong style={{ color: 'var(--mex2)' }}>{q.winningAnswer}</strong>
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
