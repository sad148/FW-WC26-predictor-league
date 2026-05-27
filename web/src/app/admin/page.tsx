'use client';

import { useEffect, useState } from 'react';
import { api, type League } from '@/lib/api';
import { useAuth, useToast } from '../providers';

export default function AdminPage() {
  const { isAdmin, isLoading, refresh } = useAuth();
  const { toast } = useToast();
  const [league, setLeague] = useState<League | null>(null);
  const [name, setName] = useState('');
  const [adminPwd, setAdminPwd] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    api.league().then(r => setLeague(r.league)).catch(() => {});
  }, [isAdmin]);

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
