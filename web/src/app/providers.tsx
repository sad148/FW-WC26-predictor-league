'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, type SessionUser, type LeagueSummary } from '@/lib/api';

// ── AUTH ─────────────────────────────────────────────────────────────

interface AuthState {
  user:             SessionUser | null;
  isAdmin:          boolean;
  isLoading:        boolean;
  wallet:           number | null;
  bailoutEligible:  boolean;
  activeLeagueId:   number | null;
  leagues:          LeagueSummary[];
  refresh:          () => Promise<void>;
  setSession:       (user: SessionUser | null, isAdmin?: boolean) => void;
  switchLeague:     (leagueId: number) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <Providers>');
  return ctx;
}

// ── TOAST ────────────────────────────────────────────────────────────

interface ToastState {
  toast: (title: string, msg?: string) => void;
}

const ToastContext = createContext<ToastState | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <Providers>');
  return ctx;
}

// ── LEAGUE PICKER MODAL ──────────────────────────────────────────────

function LeaguePicker({
  leagues,
  onPick,
}: {
  leagues: LeagueSummary[];
  onPick: (id: number) => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '2rem', maxWidth: 420, width: '100%',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 22,
          color: 'var(--gold)', letterSpacing: 1, marginBottom: '.5rem',
        }}>
          SELECT LEAGUE
        </div>
        <div style={{ color: 'var(--off)', fontSize: 13, marginBottom: '1.5rem' }}>
          You belong to multiple leagues. Pick which one to play in.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {leagues.map(l => (
            <button
              key={l.id}
              className="btn-gold"
              style={{ width: '100%' }}
              onClick={() => onPick(l.id)}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── PROVIDERS WRAPPER ────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser]                       = useState<SessionUser | null>(null);
  const [isAdmin, setIsAdmin]                 = useState(false);
  const [wallet, setWallet]                   = useState<number | null>(null);
  const [bailoutEligible, setBailoutEligible] = useState(false);
  const [isLoading, setLoad]                  = useState(true);
  const [activeLeagueId, setActiveLeagueId]   = useState<number | null>(null);
  const [leagues, setLeagues]                 = useState<LeagueSummary[]>([]);

  const refresh = useCallback(async () => {
    try {
      const meRes = await api.me();
      setUser(meRes.user);
      setIsAdmin(meRes.isAdmin);
      setActiveLeagueId(meRes.activeLeagueId);
      setLeagues(meRes.leagues);

      if (meRes.user && !meRes.isAdmin && meRes.activeLeagueId) {
        try {
          const lb = await api.leaderboard();
          const mine = lb.leaderboard.find(p => p.playerId === meRes.user!.playerId);
          const fullW = mine?.fullWallet ?? 100;
          setWallet(fullW);
          const remainingPts = (mine?.triviaPts ?? 0) + (mine?.bracketPts ?? 0) - (mine?.bailoutPenalty ?? 0);
          setBailoutEligible(fullW <= 0 && remainingPts >= 10);
        } catch { setWallet(100); setBailoutEligible(false); }
      } else {
        setWallet(null);
      }
    } finally {
      setLoad(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const switchLeague = useCallback(async (leagueId: number) => {
    await api.switchLeague({ leagueId });
    window.location.reload();
  }, []);

  const setSession = useCallback((u: SessionUser | null, admin?: boolean) => {
    setUser(u);
    if (admin !== undefined) setIsAdmin(admin);
  }, []);

  // Toast state
  const [toastData, setToastData] = useState<{ title: string; msg: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((title: string, msg = '') => {
    setToastData({ title, msg });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToastData(null), 3200);
  }, []);

  // Show league picker when logged in but no active league (multiple leagues)
  const needsLeaguePick = !isLoading && !!user && !isAdmin && !activeLeagueId && leagues.length > 1;

  return (
    <AuthContext.Provider value={{ user, isAdmin, isLoading, wallet, bailoutEligible, activeLeagueId, leagues, refresh, setSession, switchLeague }}>
      <ToastContext.Provider value={{ toast }}>
        {children}
        {needsLeaguePick && (
          <LeaguePicker leagues={leagues} onPick={switchLeague} />
        )}
        <div className={`toast${toastData ? ' show' : ''}`}>
          <div className="toast-t">{toastData?.title}</div>
          <div className="toast-m">{toastData?.msg}</div>
        </div>
      </ToastContext.Provider>
    </AuthContext.Provider>
  );
}
