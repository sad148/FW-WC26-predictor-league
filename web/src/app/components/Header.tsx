'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth, useToast } from '../providers';

const NAV = [
  { href: '/',            label: 'Home' },
  { href: '/matches',     label: 'Matches' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/mybets',      label: 'My Bets' },
  { href: '/account',     label: 'Account' },
];

export function Header() {
  const pathname  = usePathname();
  const { user, isAdmin, wallet, refresh } = useAuth();
  const { toast } = useToast();

  async function handleAdminLogout() {
    try {
      await api.adminLogout();
      await refresh();
      toast('Admin logged out');
    } catch (e) {
      toast('Error', (e as Error).message);
    }
  }

  return (
    <header className="hdr">
      <div className="accent-bar" />
      <div className="hdr-bar">
        <Link className="logo-wrap" href="/">
          <span className="logo-trophy">🏆</span>
          <div>
            <div className="logo-text">WC26 PREDICTOR</div>
            <div className="logo-sub">We Are 26</div>
          </div>
        </Link>
        <nav className="hdr-nav">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-btn${pathname === item.href ? ' on' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {/* Wallet chip is for logged-in players only (admins have no wallet). */}
        {user && !isAdmin && (
          <div className="wallet-chip">🏅 <b>{wallet ?? '—'}</b> pts</div>
        )}
        {/* Admin chip is only shown to actual admins. Non-admins reach the admin
            login form by navigating to /admin directly. */}
        {isAdmin && (
          <div className="admin-chip" onClick={handleAdminLogout}>
            ⚙ Admin On
          </div>
        )}
      </div>
    </header>
  );
}
