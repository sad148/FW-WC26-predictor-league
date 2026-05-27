'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, type SessionUser } from '@/lib/api';

// ── AUTH ─────────────────────────────────────────────────────────────

interface AuthState {
  user:      SessionUser | null;
  isAdmin:   boolean;
  isLoading: boolean;
  wallet:    number | null;        // null = no player session or not loaded yet
  refresh:   () => Promise<void>;  // re-fetches session + wallet
  setSession: (user: SessionUser | null, isAdmin?: boolean) => void;
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

// ── PROVIDERS WRAPPER ────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  // Auth state
  const [user, setUser]       = useState<SessionUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [wallet, setWallet]   = useState<number | null>(null);
  const [isLoading, setLoad]  = useState(true);

  const refresh = useCallback(async () => {
    try {
      const meRes = await api.me();
      setUser(meRes.user);
      setIsAdmin(meRes.isAdmin);
      // Only fetch the leaderboard wallet for actual player sessions.
      if (meRes.user && !meRes.isAdmin) {
        try {
          const lb = await api.leaderboard();
          const mine = lb.leaderboard.find(p => p.playerId === meRes.user!.playerId);
          setWallet(mine?.wallet ?? 100);
        } catch { setWallet(100); }
      } else {
        setWallet(null);
      }
    } finally {
      setLoad(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const setSession = useCallback((u: SessionUser | null, admin?: boolean) => {
    setUser(u);
    if (admin !== undefined) setIsAdmin(admin);
  }, []);

  // Toast state — show one at a time, auto-dismiss after 3.2s.
  const [toastData, setToastData] = useState<{ title: string; msg: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((title: string, msg = '') => {
    setToastData({ title, msg });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToastData(null), 3200);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAdmin, isLoading, wallet, refresh, setSession }}>
      <ToastContext.Provider value={{ toast }}>
        {children}
        <div className={`toast${toastData ? ' show' : ''}`}>
          <div className="toast-t">{toastData?.title}</div>
          <div className="toast-m">{toastData?.msg}</div>
        </div>
      </ToastContext.Provider>
    </AuthContext.Provider>
  );
}
