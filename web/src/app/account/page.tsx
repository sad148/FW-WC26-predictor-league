'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth, useToast } from '../providers';

export default function AccountPage() {
  const { user, refresh } = useAuth();
  const { toast }         = useToast();
  const [mode, setMode]   = useState<'login' | 'register'>('login');
  const [name, setName]   = useState('');
  const [pwd, setPwd]     = useState('');
  const [code, setCode]   = useState('');
  const [busy, setBusy]   = useState(false);

  async function submit() {
    if (!name || !pwd) return toast('Missing fields', 'Enter name and password.');
    if (mode === 'register' && !code) return toast('Missing league code', 'Ask the admin for the code.');
    setBusy(true);
    try {
      if (mode === 'login') {
        await api.login({ name, password: pwd });
        toast('✓ Logged in', `Welcome, ${name}!`);
      } else {
        await api.register({ name, password: pwd, leagueCode: code.toUpperCase() });
        toast('✓ Account created', `Welcome, ${name}!`);
      }
      setName(''); setPwd(''); setCode('');
      await refresh();
    } catch (e) {
      toast('Error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
      await refresh();
      toast('Logged out', 'See you next time!');
    } catch (e) {
      toast('Error', (e as Error).message);
    }
  }

  if (user) {
    return (
      <section>
        <div className="sh">
          <div className="sh-title">ACCOUNT</div>
          <div className="sh-sub">You are signed in.</div>
        </div>
        <div className="lform">
          <div className="lform-title" style={{ color: 'var(--mex2)' }}>SIGNED IN</div>
          <div style={{ fontSize: 18, fontFamily: 'var(--font-cond)', marginBottom: '.6rem' }}>
            Welcome, <strong style={{ color: 'var(--gold)' }}>{user.name}</strong>
          </div>
          <div style={{ color: 'var(--off)', fontSize: 13, lineHeight: 1.6, marginBottom: '1.25rem' }}>
            Head to Matches to place bets, or My Bets to see your history.
          </div>
          <button className="btn-outline" style={{ width: '100%' }} onClick={handleLogout}>Log out</button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="sh">
        <div className="sh-title">ACCOUNT</div>
        <div className="sh-sub">Sign in to place bets and join the league.</div>
      </div>

      <div className="phase-tabs" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className={`ptab${mode === 'login' ? ' on' : ''}`}
          onClick={() => setMode('login')}
        >Login</button>
        <button
          type="button"
          className={`ptab${mode === 'register' ? ' on' : ''}`}
          onClick={() => setMode('register')}
        >Register</button>
      </div>

      <div className="lform">
        <div className="lform-title" style={{ color: 'var(--gold)' }}>
          {mode === 'login' ? 'LOGIN' : 'REGISTER'}
        </div>
        <div className="fg">
          <label className="flabel">Name</label>
          <input
            className="finput"
            type="text"
            placeholder="Your display name"
            autoComplete="username"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {mode === 'register' && (
          <div className="fg">
            <label className="flabel">League Code</label>
            <input
              className="finput code-input"
              type="text"
              placeholder="WC26-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
        )}
        <div className="fg">
          <label className="flabel">Password</label>
          <input
            className="finput"
            type="password"
            placeholder="At least 4 characters"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
        </div>
        <button
          className="btn-gold"
          style={{ width: '100%', marginTop: 4 }}
          disabled={busy}
          onClick={submit}
        >
          {busy ? (mode === 'login' ? 'Logging in…' : 'Registering…') : (mode === 'login' ? 'Login →' : 'Register →')}
        </button>
      </div>
    </section>
  );
}
