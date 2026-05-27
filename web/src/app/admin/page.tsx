'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type League, type Match } from '@/lib/api';
import { useAuth, useToast } from '../providers';

interface ResultDraft {
  scoreA: string;
  scoreB: string;
  status: Match['status'];
  firstScorer: string;   // '' = not set
  totalCards:  string;   // '' = not set
}
interface FixtureDraft { nameA: string; nameB: string; date: string; phase: 'group' | 'knockout'; group: string; venue: string; }

const EMPTY_FIXTURE: FixtureDraft = { nameA: '', nameB: '', date: '', phase: 'group', group: '', venue: '' };

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

  const loadFixtures = useCallback(async () => {
    try {
      const r = await api.fixtures();
      setMatches(r.matches);
    } catch (e) { toast('Error', (e as Error).message); }
  }, [toast]);

  useEffect(() => {
    if (!isAdmin) return;
    api.league().then(r => setLeague(r.league)).catch(() => {});
    loadFixtures();
  }, [isAdmin, loadFixtures]);

  function draftFor(m: Match): ResultDraft {
    return drafts[m.id] ?? {
      scoreA:      m.scoreA      == null ? '' : String(m.scoreA),
      scoreB:      m.scoreB      == null ? '' : String(m.scoreB),
      status:      m.status,
      firstScorer: m.firstScorer ?? '',
      totalCards:  m.totalCards  == null ? '' : String(m.totalCards),
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
        status: d.status,
        firstScorer: fs,
        totalCards:  tc,
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 14, fontWeight: 700 }}>
                        {m.flagA || '⚽'} {m.teamA} vs {m.teamB} {m.flagB || ''}
                      </div>
                      <div style={{ fontFamily: 'var(--font-cond)', fontSize: 12, color: 'var(--off)', marginTop: 2 }}>
                        {m.date}{m.venue ? ` · ${m.venue}` : ''}
                      </div>
                    </div>
                    <select
                      value={d.status}
                      onChange={(e) => setResultDraft(m, { status: e.target.value as Match['status'] })}
                      style={cellSelect}
                    >
                      <option value="upcoming">Upcoming</option>
                      <option value="live">Live</option>
                      <option value="complete">Complete</option>
                    </select>
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
        <button className="btn-gold" style={{ width: '100%' }} disabled={addingFix} onClick={addFixture}>
          {addingFix ? 'Adding…' : 'Add Fixture'}
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
